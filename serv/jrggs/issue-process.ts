import _ from "lodash";
import { UpdateFilter, UpdateOneModel } from "mongodb";
import schedule from 'node-schedule';
import HC from "../../glob/hc";
import JiraIssue, { IJiraIssue, JiraIssueSyncStatus } from "../../models/jira-issue";
import AsyncLockExt, { Locked } from "../../utils/async-lock-ext";
import { JIRAService } from "../jira";

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
                update.$push = { ...update.$push, 'overrides.invalidRejections': { $each: invalidRejections } }
            }
        }

        return update
    }
}

schedule.scheduleJob('20 * * * * *', () => {
    IssueProcessorService.checkToProcess()
})
