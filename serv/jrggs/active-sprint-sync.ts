import HC from "../../glob/hc";
import AppConfig from "../../models/app-config";
import JiraIssueSyncRequest, { JiraIssueSyncRequestStatus } from "../../models/jira-issue-sync-request";
import { Catch } from "../../utils/decors";
import { JIRAService } from "../jira";
import schedule from 'node-schedule'
import { IssueProcessorService } from "./issue-process";
import moment from "moment";
import { Locked } from "../../utils/async-lock-ext";

export class SyncIssues {
    @Locked(() => 'SyncIssues')
    @Catch(err => console.log(err))
    static async process(): Promise<void> {
        const lastUpdateTimeConfig = await AppConfig.findOne({ key: 'SyncIssues_lastUpdateTime' })
        const lastUpdateTime = lastUpdateTimeConfig?.value as number || HC.SYNC_ISSUES_DEFAULT_LAST_UPDATE_TIME
        console.log('SyncIssues lastUpdateTime', lastUpdateTime)
        const issues = await JIRAService.getProjectIssues(HC.JIRA_PROJECT_KEY, lastUpdateTime)
        if (issues.length === 0) return
        const bulkOps = issues.map(issue => ({
            updateOne: {
                filter: { key: issue.key },
                update: {
                    $set: {
                        key: issue.key,
                        data: issue.issue,
                        changelog: [],
                        status: JiraIssueSyncRequestStatus.PENDING
                    }
                },
                upsert: true
            }
        }));

        await JiraIssueSyncRequest.bulkWrite(bulkOps);
        await AppConfig.updateOne({ key: 'SyncIssues_lastUpdateTime' }, { $set: { value: moment().valueOf() } }, { upsert: true })

        IssueProcessorService.checkToProcess().catch()
    }
}

schedule.scheduleJob('0 * * * * *', () => SyncIssues.process().catch((err) => console.error(err)));