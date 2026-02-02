import { AnyBulkWriteOperation } from "mongodb";
import schedule from 'node-schedule';
import HC from "../../glob/hc";
import AppConfig from "../../models/app-config";
import JiraIssue, { IJiraIssue, JiraIssueSyncStatus } from "../../models/jira-issue.mongo";
import { Locked } from "../../utils/async-lock-ext";
import { Catch } from "../../utils/decors";
import { JIRAService, JiraIssueData } from "../jira";
import { IssueProcessorService } from "./issue-process";

export class SyncNewlyUpdatedIssues {
    @Locked(() => 'SyncIssues')
    @Catch(err => console.log(err))
    static async process(): Promise<void> {
        for (const projectKey of HC.JIRA_PROJECT_KEYS) {
            await this.syncProject(projectKey)
        }
        IssueProcessorService.checkToProcess()
    }

    static async syncProject(projectKey: string): Promise<void> {
        const lastUpdateTimeConfig = await AppConfig.findOne({ key: `SyncIssues_lastUpdateTime_${projectKey}` })
        const lastUpdateTime = lastUpdateTimeConfig?.value as number || HC.SYNC_ISSUES_DEFAULT_LAST_UPDATE_TIME

        const issues = await JIRAService.getProjectIssues(projectKey, lastUpdateTime, 100)

        if (issues.length === 0) {
            return;
        }

        console.log(`[SyncIssues] Syncing ${issues.length} issues for ${projectKey}`);

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
                        metrics: {},
                        changelog: [],
                        comments: [],
                        extraData: {
                            invalidRejections: [],
                            invalidCodeReviews: [],
                            storyPoints: [],
                            defects: [],
                            excluded: false
                        }
                    }
                },
                upsert: true
            }
        }));

        await JiraIssue.bulkWrite(bulkOps);

        const oldestTimestamp = this.extractOldestUpdateTimestamp(issues);
        const newTimestamp = oldestTimestamp + 1;

        if (newTimestamp > lastUpdateTime) {
            await AppConfig.updateOne(
                { key: `SyncIssues_lastUpdateTime_${projectKey}` },
                { $set: { value: newTimestamp } },
                { upsert: true }
            );
        }
    }

    private static extractOldestUpdateTimestamp(issues: JiraIssueData[]): number | null {
        let oldestTimestamp = 0

        for (const issue of issues) {
            try {
                const updatedStr = issue.data?.fields?.updated;
                if (updatedStr) {
                    const timestamp = new Date(updatedStr).getTime();
                    if (!isNaN(timestamp) && timestamp > oldestTimestamp) {
                        oldestTimestamp = timestamp
                    }
                }
            } catch (err) {
                console.warn(`[SyncIssues] Failed to parse updated timestamp for ${issue.key}:`, err);
            }
        }

        return oldestTimestamp
    }
}

schedule.scheduleJob('0 * * * * *', () => SyncNewlyUpdatedIssues.process().catch((err) => console.error(err)));
