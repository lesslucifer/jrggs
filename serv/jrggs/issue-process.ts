import _ from "lodash";
import { UpdateFilter, UpdateOneModel } from "mongodb";
import schedule from 'node-schedule';
import HC from "../../glob/hc";
import JiraIssueOverrides, { IJiraIssueOverrides } from "../../models/jira-issue-overrides.mongo";
import JiraIssue, { IJiraCodeReview, IJiraIssue, IJiraIssueChangelogRecord, IJiraIssueHistoryRecord, IJiraIssueUserMetrics, IJiraRejection, IJiraUserInfo, JiraIssueSyncStatus } from "../../models/jira-issue.mongo";
import AsyncLockExt, { Locked } from "../../utils/async-lock-ext";
import { JiraIssueData, JIRAService } from "../jira";
import JiraObjectServ from "../jira-object.serv";
import moment from "moment";

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
            console.log("[IssueProcessorService] Processing: ", issues.map(iss => iss.key).join(', '))
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
                        syncParams: undefined,
                        lastSyncAt: Date.now(),
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

        const doesRefreshHistory = iss.syncParams?.refreshHistory

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

            if (!doesRefreshHistory) {
                const history = this.computeIssueHistoryRecords(changelog, _.last(iss.history))
                if (history.length > 0) {
                    iss.history ??= []
                    iss.history.push(...history)
                    update.$push = { ...update.$push, history: { $each: history } }
                    update.$set = { ...update.$set, current: _.last(history) }
                }
            }
        }

        if (doesRefreshHistory) {
            const history = this.computeIssueHistoryRecords(iss.changelog)
            iss.history = history
            update.$set = { ...update.$set, history: history, current: _.last(history) }
        }

        const inChargeDevs = this.computeInChargeDevs(iss)
        iss.inChargeDevs = inChargeDevs
        update.$set = { ...update.$set, inChargeDevs }

        const { codeReviews, rejections } = this.computeCodeReviewsAndRejections(iss, overrides)

        const activeCodeReviews = codeReviews.filter(cr => cr.isActive)
        const newInChargeDev = _.last(activeCodeReviews)?.userId

        if (newInChargeDev) {
            await JIRAService.updateDevInChargeIfPossible(iss.key, newInChargeDev, iss.data)
        }
        iss.extraData = {
            ...iss.extraData,
            codeReviews,
            rejections
        }
        update.$set = { ...update.$set, 'extraData.codeReviews': codeReviews, 'extraData.rejections': rejections }

        const defects = await this.computeDefects(iss, overrides)
        iss.extraData = { ...iss.extraData, defects }
        update.$set = { ...update.$set, 'extraData.defects': defects }

        const storyPoints = this.computeStoryPoints(iss, overrides)
        iss.extraData = { ...iss.extraData, storyPoints }
        update.$set = { ...update.$set, 'extraData.storyPoints': storyPoints }

        const metrics = this.computeIssueMetrics(iss)
        iss.metrics = metrics
        update.$set = { ...update.$set, metrics }

        const sprintIds = this.computeIssueSprintIds(iss)
        iss.sprintIds = sprintIds
        update.$set = { ...update.$set, sprintIds }

        return update
    }

    private static computeInChargeDevs(iss: IJiraIssue, overrides?: IJiraIssueOverrides): string[] {
        const assignees = new Map<string, number>()

        for (const log of iss.changelog) {
            const isActive = !overrides?.invalidChangelogIds?.[log.id]

            if (isActive && log.items?.some(item => item.field === 'status' && ['code review', 'in progress'].some(status => item.toString.toLowerCase().includes(status)))) {
                assignees.set(log.author.accountId, new Date(log.created).getTime())
            }
        }
        
        assignees.set(iss.data.fields.assignee?.accountId, Date.now())

        return _.sortBy(Array.from(assignees.entries()), (a) => a[1]).map(a => a[0])
    }

    private static computeIssueHistoryRecords(changelogs: IJiraIssueChangelogRecord[], current?: IJiraIssueHistoryRecord): IJiraIssueHistoryRecord[] {
        const history: IJiraIssueHistoryRecord[] = [];
        let lastRecord: IJiraIssueHistoryRecord | undefined = current

        // Process all changelogs in chronological order
        for (const log of changelogs) {
            const time = new Date(log.created).getTime();
            const update: Partial<IJiraIssueHistoryRecord> = {};

            // Process each change item in the changelog
            for (const item of log.items || []) {
                switch (item.field) {
                    case 'assignee':
                        update.assigneeId = item.to || undefined;
                        update.assigneeName = item.toString || undefined;
                        update.field = item.field;
                        break;
                    case 'status':
                        update.status = item.toString || '';
                        update.field = item.field;
                        break;
                    case 'Sprint':
                        update.sprintId = Number(_.last(item.to?.split(','))?.trim()) || undefined;
                        update.sprintName = _.last(item.toString?.split(','))?.trim() || undefined;
                        update.field = item.field;
                        break;
                    default:
                        break;
                }
            }

            if (!_.isEmpty(update)) {
                const newRecord: IJiraIssueHistoryRecord = {
                    ...lastRecord,
                    ...update,
                    time
                }

                history.push(newRecord)
                lastRecord = newRecord
            }
        }

        return history;
    }

    private static computeCodeReviewsAndRejections(iss: IJiraIssue, overrides?: IJiraIssueOverrides): { codeReviews: IJiraCodeReview[], rejections: IJiraRejection[] } {
        const codeReviews: IJiraCodeReview[] = []
        const rejections: IJiraRejection[] = []
        let lastDev: string | null = null
        for (const log of iss.changelog) {
            const isActive = !overrides?.invalidChangelogIds?.[log.id]
            const author = JiraObjectServ.get(log.author.accountId)

            if (author?.fields.role === 'DEV' && log.items?.some(item => item.field === 'status' && item.toString.includes('Code Review'))) {
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
        return { codeReviews, rejections }
    }

    private static computeStoryPoints(iss: IJiraIssue, overrides?: IJiraIssueOverrides): { userId: string; storyPoints: number }[] {
        if (!_.isEmpty(overrides?.storyPoints)) {
            return Object.entries(overrides.storyPoints).map(([uid, sp]) => ({ userId: uid, storyPoints: sp })).filter(sp => sp.storyPoints > 0)
        }

        const issueData = new JiraIssueData(iss.data)
        const sp = issueData.storyPoint
        if (sp === 0) {
            return []
        }

        const devCounter = _.countBy((iss.extraData?.codeReviews ?? []).filter(cr => cr.isActive).map(cr => cr.userId))
        const sortedDevs = _.sortBy(Object.keys(devCounter), (uid) => -devCounter[uid])
        if (sortedDevs.length === 0) {
            sortedDevs.push('unknown')
        }

        return sortedDevs.map((uid, idx) => {
            const devSp = Math.floor(sp / sortedDevs.length) + (idx < sp % sortedDevs.length ? 1 : 0)
            return { userId: uid, storyPoints: devSp }
        })
    }

    private static async computeDefects(iss: IJiraIssue, overrides?: IJiraIssueOverrides): Promise<{ userId: string; issueKey: string; isActive: boolean }[]> {
        const subIssues = await JiraIssue.find({ 'data.fields.parent.key': iss.key, 'extraData.excluded': { $ne: true } }).toArray()
        return subIssues.filter(sub => new JiraIssueData(sub.data).summary?.toLowerCase().includes('defect')).map(sub => ({
            userId: _.first(sub.extraData?.codeReviews)?.userId ?? 'unknown',
            issueKey: sub.key,
            isActive: !overrides?.invalidDefectsIds?.[sub.key]
        }))
    }

    private static computeIssueMetrics(iss: IJiraIssue): IJiraIssueUserMetrics {
        const storyPoints = _.chain(iss.extraData.storyPoints).keyBy('userId').mapValues('storyPoints').value()
        const nRejections = _.countBy((iss.extraData?.rejections ?? []).filter(rej => rej.isActive).map(rej => rej.userId))
        const nCodeReviews = _.countBy((iss.extraData?.codeReviews ?? []).filter(cr => cr.isActive).map(cr => cr.userId))
        const defects = _.countBy((iss.extraData?.defects ?? []).filter(d => d.isActive).map(d => d.userId))

        const uids = new Set([...Object.keys(storyPoints), ...Object.keys(nRejections), ...Object.keys(nCodeReviews), ...Object.keys(defects)])

        return Array.from(uids).reduce((metrics, uid) => {
            metrics[uid] = {
                storyPoints: storyPoints[uid] ?? 0,
                nRejections: nRejections[uid] ?? 0,
                nCodeReviews: nCodeReviews[uid] ?? 0,
                defects: defects[uid] ?? 0,
            }
            return metrics
        }, {} as IJiraIssueUserMetrics)
    }

    private static computeIssueSprintIds(iss: IJiraIssue): number[] {
        const sprintIds = new Set<number>()
        
        for (const log of iss.changelog) {
            const sprintItems = log.items?.filter(item => item.field === 'Sprint' && item.to) ?? [];
            for (const item of sprintItems) {
                const ids = item.to.split(',')
                    .map(id => parseInt(id.trim()))
                    .filter(id => !isNaN(id));
                ids.forEach(id => sprintIds.add(id));
            }
        }

        if (iss.completedSprint?.id) {
            sprintIds.add(iss.completedSprint.id);
        }
    
        return _.sortBy(Array.from(sprintIds));
    }
}

schedule.scheduleJob('20 * * * * *', () => {
    console.log("PROCESS_ISSUE at", moment().format('YYYY-MM-DD HH:mm:ss.SSS'))
    IssueProcessorService.checkToProcess()
})
