import HC from "../../glob/hc";
import AppConfig from "../../models/app-config";
import JiraIssueSyncRequest, { JiraIssueSyncRequestStatus } from "../../models/jira-issue-sync-request";
import { Catch } from "../../utils/decors";
import { JIRAService } from "../jira";

export class SyncIssues {
    @Catch(err => console.log(err))
    async process(): Promise<void> {
        const lastUpdateTimeConfig = await AppConfig.findOne({ key: 'SyncIssues_lastUpdateTime' })
        const lastUpdateTime = lastUpdateTimeConfig?.value as number || HC.SYNC_ISSUES_DEFAULT_LAST_UPDATE_TIME
        const issues = await JIRAService.getIssues(lastUpdateTime)
        const bulkOps = issues.map(issue => ({
            updateOne: {
                filter: { key: issue.key },
                update: {
                    $set: {
                        key: issue.key,
                        data: issue.issue,
                        status: JiraIssueSyncRequestStatus.PENDING
                    }
                },
                upsert: true
            }
        }));

        await JiraIssueSyncRequest.bulkWrite(bulkOps);
    }
}