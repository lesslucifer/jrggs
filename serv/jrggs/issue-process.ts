import HC from "../../glob/hc";
import JiraIssueSyncRequest, { IJiraIssueSyncRequest, JiraIssueSyncRequestStatus } from "../../models/jira-issue-sync-request";
import AsyncLockExt, { Locked } from "../../utils/async-lock-ext";
import { JIRAService } from "../jira";
import schedule from 'node-schedule'

export class IssueProcessorService {
    private static Lock = new AsyncLockExt()
    private static isProcessing = false
    
    static async checkToProcess() {
        if (this.isProcessing) return

        const requests = await this.tryFetchItemsToProcess()
        if (!requests) return

        try {
            this.isProcessing = true
            await Promise.all(requests.map(req => this.processItem(req)))

            await JiraIssueSyncRequest.updateMany(
                { _id: { $in: requests.map(req => req._id) } },
                { $set: { status: JiraIssueSyncRequestStatus.SUCCESS, updatedAt: Date.now() } }
            );
        } catch (error) {
            await JiraIssueSyncRequest.updateMany(
                { _id: { $in: requests.map(req => req._id) } },
                { $set: { status: JiraIssueSyncRequestStatus.FAILED, updatedAt: Date.now() } }
            );
        }
        finally {
            this.isProcessing = false
            this.checkToProcess().catch()
        }
    }

    @Locked(() => "tryFetchMessageToProcess", IssueProcessorService.Lock)
    private static async tryFetchItemsToProcess() {
        try {
            const requests = await JiraIssueSyncRequest.find(
                { status: JiraIssueSyncRequestStatus.PENDING },
                { sort: { _id: 1 } }
            ).limit(HC.JIRA_ISSUE_SYNC_REQUEST_PROCESS_LIMIT).toArray();

            return requests
        }
        catch {
            return []
        }
    }

    static async processItem(req: IJiraIssueSyncRequest) {
        const changelog = await JIRAService.getIssueChangelog(req.key, req.changelog.length)
        if (changelog.length === 0) return

        req.changelog.push(...changelog)
        await JiraIssueSyncRequest.updateOne({ _id: req._id }, { $push: { changelog: { $each: changelog } } })

        console.log("ISSUE NEW CHANGELOG", req.key, changelog)
    }
}

schedule.scheduleJob('20 * * * * *', () => {
    IssueProcessorService.checkToProcess().catch()
})
