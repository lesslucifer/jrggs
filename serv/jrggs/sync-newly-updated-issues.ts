import { AnyBulkWriteOperation } from "mongodb";
import schedule from 'node-schedule';
import HC from "../../glob/hc";
import AppConfig from "../../models/app-config";
import JiraIssue, { IJiraIssue, JiraIssueSyncStatus } from "../../models/jira-issue.mongo";
import { Locked } from "../../utils/async-lock-ext";
import { Catch } from "../../utils/decors";
import { JIRAService } from "../jira";
import { IssueProcessorService } from "./issue-process";

export class SyncNewlyUpdatedIssues {
    @Locked(() => 'SyncIssues')
    @Catch(err => console.log(err))
    static async process(): Promise<void> {
        const lastUpdateTimeConfig = await AppConfig.findOne({ key: 'SyncIssues_lastUpdateTime' })
        const lastUpdateTime = lastUpdateTimeConfig?.value as number || HC.SYNC_ISSUES_DEFAULT_LAST_UPDATE_TIME
        const issues = await JIRAService.getProjectIssues(HC.JIRA_PROJECT_KEY, lastUpdateTime)
        if (issues.length === 0) return

        const bulkOps: AnyBulkWriteOperation<IJiraIssue>[] = issues.map(issue => ({
            updateOne: {
                filter: { key: issue.key },
                update: {
                    $set: {
                        data: issue.data,
                        syncStatus: JiraIssueSyncStatus.PENDING,
                        lastSyncAt: Date.now()
                    },
                    $setOnInsert: {
                        metrics: {
                            storyPoints: {},
                            nRejections: {},
                            nDefects: {}
                        },
                        overrides: {
                            invalidRejections: [],
                            storyPoints: {}
                        },
                        changelog: [],
                        comments: []
                    }
                },
                upsert: true
            }
        }));

        await JiraIssue.bulkWrite(bulkOps);
        await AppConfig.updateOne({ key: 'SyncIssues_lastUpdateTime' }, { $set: { value: Date.now() } }, { upsert: true })

        IssueProcessorService.checkToProcess()
    }
}

schedule.scheduleJob('0 * * * * *', () => SyncNewlyUpdatedIssues.process().catch((err) => console.error(err)));
