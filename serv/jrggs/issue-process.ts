import _ from "lodash";
import { UpdateFilter, UpdateOneModel } from "mongodb";
import schedule from 'node-schedule';
import HC from "../../glob/hc";
import JiraIssue, { IJiraIssue, IJiraIssueMetrics, JiraIssueSyncStatus } from "../../models/jira-issue";
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
            const itemUpdates = await Promise.all(issues.map(iss => this.processIssue(iss)))

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

    static async processIssue(iss: IJiraIssue): Promise<UpdateOneModel<IJiraIssue>> {
        try {
            const update = await this.updateIssue(iss)

            return {
                filter: { _id: iss._id },
                update: {
                    ...update,
                    $set: {
                        ...update.$set,
                        syncStatus: JiraIssueSyncStatus.SUCCESS,
                        lastSyncAt: Date.now()
                    }
                }
            }
        } catch (error) {
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

    static async updateIssue(iss: IJiraIssue): Promise<UpdateFilter<IJiraIssue>> {
        const update: UpdateFilter<IJiraIssue> = {}

        const changelog = await JIRAService.getIssueChangelog(iss.key, iss.changelog.length)
        if (changelog.length > 0) {
            iss.changelog.push(...changelog)

            update.$push = { ...update.$push, changelog: { $each: changelog } }

            const finishLog = _.findLast(changelog, log => {
                return log.items?.some(item => item.field === 'status' && (item.toString === 'Done' || item.toString === 'Closed'))
            })

            if (finishLog) {
                update.$set = { ...update.$set, completedAt: new Date(finishLog.created).getTime() }
            }
        }

        const comments = await JIRAService.getIssueComments(iss.key)
        if (comments.length > 0) {
            iss.comments.push(...comments)
            update.$push = { ...update.$push, comments: { $each: comments } }

            const invalidRejections = comments.filter(comment => comment.body.startsWith('[INVALID REJECTION]')).map(comment => {
                return {
                    uid: comment.author.accountId,
                    created: new Date(comment.created).getTime(),
                    text: comment.body
                }
            })

            if (invalidRejections.length > 0) {
                iss.overrides.invalidRejections.push(...invalidRejections)
                update.$push = { ...update.$push, 'overrides.invalidRejections': { $each: invalidRejections } }
            }
        }

        const metrics = await this.computeIssueMetrics(iss)
        if (!_.isEmpty(metrics)) {
            update.$set = { ...update.$set, metrics }
        }

        return update
    }

    private static async computeIssueMetrics(iss: IJiraIssue): Promise<IJiraIssueMetrics> {
        return {
            storyPoints: this.computeStoryPoints(iss),
            nRejections: this.computeNRejections(iss),
            nDefects: await this.computeNDefects(iss)
        }
    }

    private static computeStoryPoints(iss: IJiraIssue): Record<string, number> {
        if (iss.overrides.storyPoints) {
            return iss.overrides.storyPoints
        }
        
        const devCounter = _.countBy(iss.changelog.filter(log => log.items?.some(item => item.field === 'status' && item.toString === 'Code Review')), log => log.author.accountId)
        const sortedDevs = _.sortBy(Object.keys(devCounter), (uid) => -devCounter[uid])

        const issueData = new JiraIssueData(iss.data)
        const sp = issueData.storyPoint

        return sortedDevs.reduce((acc, uid, idx) => {
            acc[uid] = Math.floor(sp / sortedDevs.length) + (idx < sp % sortedDevs.length ? 1 : 0)
            return acc
        }, {} as Record<string, number>)
    }

    private static computeNRejections(iss: IJiraIssue): Record<string, number> {
        const rejections: Record<string, number> = {};
        let lastDev: string | null = null;

        for (const log of iss.changelog) {
            const statusChange = log.items?.find(item => item.field === 'status');
            if (statusChange) {
                if (statusChange.toString === 'Code Review') {
                    lastDev = log.author.accountId;
                } else if (statusChange.toString === 'Rejected' && lastDev) {
                    rejections[lastDev] = (rejections[lastDev] || 0) + 1;
                    lastDev = null;
                }
            }
        }

        for (const invalidRejection of iss.overrides.invalidRejections) {
            if (rejections[invalidRejection.uid]) {
                rejections[invalidRejection.uid]--;
            }
        }

        return Object.fromEntries(
            Object.entries(rejections).filter(([_, value]) => value > 0)
        );
    }
    
    private static async computeNDefects(iss: IJiraIssue): Promise<Record<string, number>> {
        const subIssues = await JiraIssue.find({ 'data.fields.parent.key': iss.key }).toArray()
        const defects = subIssues.filter(sub => new JiraIssueData(sub.data).summary?.toLowerCase().includes('defect'))
        const nDefects: Record<string, number> = {}
        for (const defect of defects) {
            if (defect.comments.some(comment => comment.body.toLowerCase().includes('[invalid defect]'))) continue
            const devId = defect.changelog.find(log => log.items?.some(item => item.field === 'status' && item.toString === 'Code Review'))?.author.accountId ?? ''
            if (devId) {
                nDefects[devId] = (nDefects[devId] || 0) + 1
            }
        }
        return nDefects
    }
}

schedule.scheduleJob('20 * * * * *', () => {
    IssueProcessorService.checkToProcess()
})
