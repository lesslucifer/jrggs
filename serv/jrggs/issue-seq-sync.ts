import schedule from 'node-schedule';
import JiraIssue, { JiraIssueSyncStatus } from "../../models/jira-issue.mongo";
import AsyncLockExt, { Locked } from '../../utils/async-lock-ext';
import HC from '../../glob/hc';
import { JiraIssueData } from '../jira';
import _ from 'lodash';

export class IssueSeqSyncService {
    // private static Lock = new AsyncLockExt()
    // private static isProcessing = false

    // static checkToProcess() {
    //     this.asyncProcess().catch()
    // }

    // static async asyncProcess() {
    //     if (this.isProcessing) return

    //     const issues = await this.tryFetchItemsToProcess()
    //     if (!issues?.length) return

    //     try {
    //         this.isProcessing = true
            
    //         await JiraIssueSeq.bulkCreate(issues.map(iss => {   
    //             const data = new JiraIssueData(iss.data)
    //             return {
    //                 key: iss.key,
    //                 type: data.type,
    //                 severity: data.severity,
    //                 completedSprint: iss.completedSprint?.id && Number(iss.completedSprint?.id),
    //                 completedAt: iss.completedAt ? new Date(iss.completedAt) : null
    //             }
    //         }), {
    //             updateOnDuplicate: ['type', 'severity', 'completedSprint', 'completedAt']
    //         })

    //         const metrics = issues.flatMap(iss => Object.keys(iss.metrics).map(userId => ({
    //             issueKey: iss.key,
    //             userId,
    //             storyPoints: iss.metrics[userId].storyPoints,
    //             nRejections: iss.metrics[userId].nRejections,
    //             nCodeReviews: iss.metrics[userId].nCodeReviews,
    //             nDefects: iss.metrics[userId].defects?.length
    //         })))
    //         if (metrics.length) {
    //             await JiraIssueMetricsSeq.bulkCreate(metrics, {
    //                 updateOnDuplicate: ['storyPoints', 'nRejections', 'nCodeReviews', 'nDefects']
    //             })
    //         }

    //         await JiraIssue.updateMany({ _id: { $in: issues.map(iss => iss._id) } }, { $set: { seqSyncAt: Date.now() } })
    //     } catch (error) {
    //         console.error(error)
    //     }
    //     finally {
    //         this.isProcessing = false
    //         this.checkToProcess()
    //     }
    // }


    // @Locked(() => "tryFetchItemsToProcess", IssueSeqSyncService.Lock)
    // private static async tryFetchItemsToProcess() {
    //     try {
    //         const issues = await JiraIssue.find(
    //             { seqSyncAt: { $eq: null } },
    //             { sort: { _id: 1 } }
    //         ).limit(HC.JIRA_ISSUE_PROCESS_LIMIT).sort({ _id: 1 }).toArray();
    //         return issues
    //     }
    //     catch {
    //         return []
    //     }
    // }
}
