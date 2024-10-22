import _ from "lodash";
import { UpdateFilter, UpdateOneModel } from "mongodb";
import schedule from 'node-schedule';
import HC from "../../glob/hc";
import JiraIssueOverrides, { IJiraIssueOverrides } from "../../models/jira-issue-overrides.mongo";
import JiraIssue, { IJiraCodeReview, IJiraIssue, IJiraIssueUserMetrics, IJiraRejection, JiraIssueSyncStatus } from "../../models/jira-issue.mongo";
import AsyncLockExt, { Locked } from "../../utils/async-lock-ext";
import { JiraIssueData, JIRAService } from "../jira";

export class IssueProcessorService {
    private static Lock = new AsyncLockExt()
    private static isProcessing = false

    static checkToProcess() {
        this.asyncProcess().catch()
    }

    static async asyncProcess() {
        if (this.isProcessing) return

        const issues = await this.tryFetchItemsToProcess()
        if (!issues?.length) return

        try {
            this.isProcessing = true
            const overrides = await JiraIssueOverrides.find({ key: { $in: issues.map(iss => iss.key) } }).toArray()
            const overridesMap = _.keyBy(overrides, 'key')
            const itemUpdates = await Promise.all(issues.map(iss => this.processIssue(iss, overridesMap[iss.key])))

            const bulkOps = itemUpdates.map(update => ({
                updateOne: update
            }))
            if (bulkOps.length > 0) {
                await JiraIssue.bulkWrite(bulkOps)
            }
        } catch (error) {
            console.error(error)
        }
        finally {
            this.isProcessing = false
            this.checkToProcess()
        }
    }

    @Locked(() => "tryFetchMessageToProcess", IssueProcessorService.Lock)
    private static async tryFetchItemsToProcess() {
        try {
            const issues = await JiraIssue.find(
                { syncStatus: JiraIssueSyncStatus.PENDING },
                { sort: { _id: 1 } }
            ).limit(HC.JIRA_ISSUE_PROCESS_LIMIT).toArray();

            return issues
        }
        catch {
            return []
        }
    }

    static async processIssue(iss: IJiraIssue, overrides?: IJiraIssueOverrides): Promise<UpdateOneModel<IJiraIssue>> {
        try {
            const update = await this.updateIssue(iss, overrides)

            return {
                filter: { _id: iss._id },
                update: {
                    ...update,
                    $set: {
                        ...update.$set,
                        syncStatus: JiraIssueSyncStatus.SUCCESS,
                        lastSyncAt: Date.now(),
                        seqSyncAt: null
                    }
                }
            }
        } catch (error) {
            console.error(error)
            return {
                filter: { _id: iss._id },
                update: {
                    $set: {
                        syncStatus: JiraIssueSyncStatus.FAILED,
                        lastSyncAt: Date.now()
                    }
                }
            }
        }
    }

    static async updateIssue(iss: IJiraIssue, overrides?: IJiraIssueOverrides): Promise<UpdateFilter<IJiraIssue>> {
        const update: UpdateFilter<IJiraIssue> = {}

        const changelog = await JIRAService.getIssueChangelog(iss.key, iss.changelog.length)
        if (changelog.length > 0) {
            iss.changelog.push(...changelog)

            update.$push = { ...update.$push, changelog: { $each: changelog } }

            const finishLog = _.findLast(changelog, log => {
                return log.items?.some(item => item.field === 'status' && (item.toString === 'Done' || item.toString === 'Closed'))
            })

            if (finishLog) {
                update.$set = { ...update.$set, completedAt: new Date(finishLog.created).getTime(), completedSprint: new JiraIssueData(iss.data).lastSprint }
            }
        }

        const codeReviews: IJiraCodeReview[] = []
        const rejections: IJiraRejection[] = []
        let lastDev: string | null = null
        for (const log of changelog) {
            const isActive = !overrides?.invalidChangelogIds?.[log.id]

            if (log.items?.some(item => item.field === 'status' && item.toString.includes('Code Review'))) {
                if (isActive) {
                    lastDev = log.author.accountId
                }
                codeReviews.push({
                    changelogId: log.id,
                    userId: log.author.accountId,
                    time: new Date(log.created).getTime(),
                    isActive
                })
            }

            if (log.items?.some(item => item.field === 'status' && item.toString.includes('Rejected'))) {
                rejections.push({
                    changelogId: log.id,
                    userId: lastDev,
                    rejectedBy: log.author.accountId,
                    time: new Date(log.created).getTime(),
                    isActive
                })
            }
        }
        update.$set = { ...update.$set, 'extraData.codeReviews': codeReviews, 'extraData.rejections': rejections }

        if (!_.isEmpty(overrides?.storyPoints)) {
            iss.extraData.storyPoints = overrides.storyPoints
            update.$set = { ...update.$set, 'extraData.storyPoints': overrides.storyPoints }
        }

        const metrics = await this.computeIssueMetrics(iss)
        if (!_.isEmpty(metrics)) {
            iss.metrics = metrics
            update.$set = { ...update.$set, metrics }
        }

        return update
    }

    private static async computeIssueMetrics(iss: IJiraIssue): Promise<IJiraIssueUserMetrics> {
        const storyPoints = this.computeStoryPoints(iss)
        const nRejections = this.computeRejections(iss)
        const nCodeReviews = this.computeNCodeReviews(iss)
        const defects = await this.computeNDefects(iss)

        const uids = new Set([...Object.keys(storyPoints), ...Object.keys(nRejections), ...Object.keys(nCodeReviews), ...Object.keys(defects)])

        return Array.from(uids).reduce((metrics, uid) => {
            metrics[uid] = {
                storyPoints: storyPoints[uid] ?? 0,
                nRejections: nRejections[uid] ?? 0,
                nCodeReviews: nCodeReviews[uid] ?? 0,
                defects: defects[uid] ?? [],
            }
            return metrics
        }, {} as IJiraIssueUserMetrics)
    }

    private static computeStoryPoints(iss: IJiraIssue): Record<string, number> {
        if (!_.isEmpty(iss.extraData.storyPoints)) {
            return iss.extraData.storyPoints
        }

        const issueData = new JiraIssueData(iss.data)
        const sp = issueData.storyPoint
        if (sp === 0) {
            return {}
        }

        const devCounter = _.countBy(iss.changelog.filter(log => log.items?.some(item => item.field === 'status' && item.toString === 'Code Review')), log => log.author.accountId)
        const sortedDevs = _.sortBy(Object.keys(devCounter), (uid) => -devCounter[uid])
        if (sortedDevs.length === 0) {
            sortedDevs.push('unknown')
        }

        return sortedDevs.reduce((acc, uid, idx) => {
            const devSp = Math.floor(sp / sortedDevs.length) + (idx < sp % sortedDevs.length ? 1 : 0)
            if (devSp > 0) {
                acc[uid] = devSp
            }
            return acc
        }, {} as Record<string, number>)
    }

    private static computeRejections(iss: IJiraIssue): Record<string, number> {
        return _.countBy((iss.extraData?.rejections ?? []).filter(rej => rej.isActive).map(rej => rej.userId))
    }

    private static computeNCodeReviews(iss: IJiraIssue): Record<string, number> {
        return _.countBy((iss.extraData?.codeReviews ?? []).filter(cr => cr.isActive).map(cr => cr.userId))
    }

    private static async computeNDefects(iss: IJiraIssue): Promise<Record<string, string[]>> {
        const subIssues = await JiraIssue.find({ 'data.fields.parent.key': iss.key }).toArray()
        const defects = subIssues.filter(sub => new JiraIssueData(sub.data).summary?.toLowerCase().includes('defect'))
        const nDefects: Record<string, string[]> = {}
        for (const defect of defects) {
            const devId = _.first(defect.extraData?.codeReviews)?.userId ?? ''
            if (!(devId in nDefects)) {
                nDefects[devId] = []
            }
            nDefects[devId].push(defect.key)
        }
        return nDefects
    }
}

schedule.scheduleJob('20 * * * * *', () => {
    IssueProcessorService.checkToProcess()
})
