import { UpdateFilter, UpdateOneModel } from "mongodb";
import schedule from 'node-schedule';
import _ from 'lodash';
import HC from "../../glob/hc";
import BitbucketPR, { BitbucketPRSyncStatus, IBitbucketPR, IBitbucketPRComputedData } from "../../models/bitbucket-pr.mongo";
import { AsyncLockExt, Locked } from "../../utils/async-lock-ext";
import { BitbucketService } from "../bitbucket";
import JiraIssue, { JiraIssueSyncStatus } from "../../models/jira-issue.mongo";
import { IssueProcessorService } from "./issue-process";

function extractJiraIssueKeys(text: string, projectKeys: string[]): string[] {
    if (!text || !projectKeys || projectKeys.length === 0) {
        return [];
    }

    // Regex: (MBL6|PROJ2)-\d+
    // \b = word boundary, ensures no partial matches
    // gi = global, case-insensitive
    const projectPattern = projectKeys.join('|');
    const regex = new RegExp(`\\b(${projectPattern})-(\\d+)\\b`, 'gi');

    const matches = text.matchAll(regex);
    const issueKeys = new Set<string>();

    for (const match of matches) {
        issueKeys.add(match[0].toUpperCase());
    }

    return Array.from(issueKeys).sort();
}

function extractLinkedJiraIssues(pr: IBitbucketPR): string[] {
    const projectKeys = HC.JIRA_PROJECT_KEYS;
    const allKeys = new Set<string>();

    const titleKeys = extractJiraIssueKeys(pr.data.title || '', projectKeys);
    titleKeys.forEach(key => allKeys.add(key));

    if (pr.activity && pr.activity.length > 0) {
        for (const activity of pr.activity) {
            const commentText = activity.comment?.content?.raw || '';
            const commentKeys = extractJiraIssueKeys(commentText, projectKeys);
            commentKeys.forEach(key => allKeys.add(key));
        }
    }

    return Array.from(allKeys).sort();
}

export class BitbucketPRProcessorService {
    private static Lock = new AsyncLockExt();
    private static isProcessing = false;

    static checkToProcess() {
        this.asyncProcess().catch();
    }

    static async asyncProcess() {
        if (this.isProcessing) return;

        const prs = await this.tryFetchItemsToProcess();
        if (!prs?.length) return;

        try {
            this.isProcessing = true;

            const activeLinkedIssueKeys = new Set(prs.map(pr => pr.activeLinkedIssueKey).filter(Boolean));

            const itemUpdates = await Promise.all(prs.map(pr => this.processPR(pr)));

            const bulkOps = itemUpdates.map(update => ({ updateOne: update }));
            if (bulkOps.length > 0) {
                await BitbucketPR.bulkWrite(bulkOps);
            }

            prs.forEach(pr => pr.activeLinkedIssueKey && activeLinkedIssueKeys.add(pr.activeLinkedIssueKey));

            if (activeLinkedIssueKeys.size > 0) {
                await JiraIssue.updateMany(
                    { key: { $in: Array.from(activeLinkedIssueKeys) } },
                    { $set: { syncStatus: JiraIssueSyncStatus.PENDING, syncParams: {
                        skipHistory: true,
                        skipChangeLog: true,
                        skipDevInCharge: true
                    } } }
                );
                IssueProcessorService.checkToProcess()
            }
        } catch (error) {
            console.error('[BitbucketPRProcessor]', error);
        } finally {
            this.isProcessing = false;
            this.checkToProcess();
        }
    }

    @Locked(() => "tryFetchPRsToProcess", BitbucketPRProcessorService.Lock)
    private static async tryFetchItemsToProcess() {
        try {
            const prs = await BitbucketPR.find(
                { syncStatus: BitbucketPRSyncStatus.PENDING },
                { sort: { _id: 1 } }
            ).limit(HC.BITBUCKET_PR_PROCESS_LIMIT).toArray();

            return prs;
        } catch {
            return [];
        }
    }

    static async processPR(pr: IBitbucketPR): Promise<UpdateOneModel<IBitbucketPR>> {
        try {
            const update = await this.updatePR(pr);

            return {
                filter: { _id: pr._id },
                update: {
                    ...update,
                    $set: {
                        ...update.$set,
                        syncStatus: BitbucketPRSyncStatus.SUCCESS,
                        syncParams: undefined,
                        lastSyncAt: Date.now()
                    }
                }
            };
        } catch (error) {
            console.error('[BitbucketPRProcessor] Error processing PR:', pr.prId, error);
            return {
                filter: { _id: pr._id },
                update: {
                    $set: {
                        syncStatus: BitbucketPRSyncStatus.FAILED,
                        lastSyncAt: Date.now()
                    }
                }
            };
        }
    }

    static async updatePR(pr: IBitbucketPR) {
        const update: UpdateFilter<IBitbucketPR> = { $set: {} }

        const doesRefreshActivity = pr.syncParams?.refreshActivity;
        const doesRefreshCommits = pr.syncParams?.refreshCommits;

        if (doesRefreshActivity) {
            const activity = await BitbucketService.getPRActivity(pr.workspace, pr.repoSlug, pr.prId);
            pr.activity = activity
            update.$set = { ...update.$set, activity };
        }

        if (doesRefreshCommits) {
            const commits = await BitbucketService.getPRCommits(pr.workspace, pr.repoSlug, pr.prId);
            pr.commits = commits
            update.$set = { ...update.$set, commits };
        }

        const computedData = { ...this.computePRMetrics(pr), ...pr.overrides?.computedData };
        let picAccountId = pr.data.author?.account_id ?? pr.overrides?.picAccountId;

        const linkedJiraIssues = extractLinkedJiraIssues(pr);
        const activeLinkedIssueKey = pr.activeLinkedIssueKey ?? _.first(linkedJiraIssues);
        if (!_.isNil(activeLinkedIssueKey) && !linkedJiraIssues.includes(activeLinkedIssueKey)) {
            linkedJiraIssues.push(activeLinkedIssueKey)
        }
        linkedJiraIssues.sort()
        const status = pr.data.state

        update.$set = { ...update.$set, computedData, picAccountId, status, activeLinkedIssueKey, linkedJiraIssues };

        return update;
    }

    private static computePRMetrics(pr: IBitbucketPR): IBitbucketPRComputedData {
        const picAccountId = pr.overrides?.picAccountId ?? pr.data.author?.account_id;
        const activity = pr.activity ?? [];
        const comments = activity.filter(a => a.comment);
        const approvals = activity.filter(a => a.approval);
        const declines = activity.filter(a => a.update?.state === 'CHANGES_REQUESTED' || a.update?.state === 'DECLINED');

        const reviewersApproved = approvals
            .map(a => a.approval?.user?.account_id)
            .filter(Boolean) as string[];

        const reviewersRequestedChanges = declines
            .map(a => a.update?.author?.account_id)
            .filter(Boolean) as string[];

        const firstReviewActivity = activity.find(a => a.approval || a.comment);
        const firstReviewTime = firstReviewActivity?.approval?.date || firstReviewActivity?.comment?.created_on
            ? new Date(firstReviewActivity.approval?.date || firstReviewActivity.comment?.created_on!).getTime()
            : undefined;

        const reviewerCommentCounts = _.countBy(comments.map(a => a.comment.user?.account_id).filter(uid => uid && uid !== picAccountId));
        return {
            totalComments: comments.length,
            totalApprovals: approvals.length,
            totalDeclines: declines.length,
            reviewersApproved,
            reviewersRequestedChanges,
            firstReviewTime,
            reviewerCommentCounts,
        };
    }
}

schedule.scheduleJob('20 * * * * *', () => {
    BitbucketPRProcessorService.checkToProcess();
});
