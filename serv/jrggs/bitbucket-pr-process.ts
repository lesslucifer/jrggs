import { UpdateFilter, UpdateOneModel } from "mongodb";
import schedule from 'node-schedule';
import _ from 'lodash';
import HC from "../../glob/hc";
import BitbucketPR, { BitbucketPRSyncStatus, IBitbucketPR, IBitbucketPRComputedData } from "../../models/bitbucket-pr.mongo";
import { AsyncLockExt, Locked } from "../../utils/async-lock-ext";
import { BitbucketService } from "../bitbucket";

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

            const itemUpdates = await Promise.all(prs.map(pr => this.processPR(pr)));

            const bulkOps = itemUpdates.map(update => ({ updateOne: update }));
            if (bulkOps.length > 0) {
                await BitbucketPR.bulkWrite(bulkOps);
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

        let activity = pr.activity;
        if (doesRefreshActivity || pr.activity.length === 0) {
            activity = await BitbucketService.getPRActivity(pr.workspace, pr.repoSlug, pr.prId);
            update.$set = { ...update.$set, activity };
        }

        let commits = pr.commits;
        if (doesRefreshCommits || pr.commits.length === 0) {
            commits = await BitbucketService.getPRCommits(pr.workspace, pr.repoSlug, pr.prId);
            update.$set = { ...update.$set, commits };
        }

        let computedData = this.computePRMetrics(pr, activity);

        let picAccountId = pr.data.author?.account_id;

        if (pr.overrides) {
            if (pr.overrides.computedData) {
                computedData = { ...computedData, ...pr.overrides.computedData };
            }

            if (pr.overrides.picAccountId) {
                picAccountId = pr.overrides.picAccountId;
            }
        }

        const status = pr.status === 'COMPLETED' ? pr.status : pr.data.state

        update.$set = { ...update.$set, computedData, picAccountId, status };

        return update;
    }

    private static computePRMetrics(pr: IBitbucketPR, activity: any[]): IBitbucketPRComputedData {
        const prData = pr.data;

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

        return {
            totalComments: comments.length,
            totalApprovals: approvals.length,
            totalDeclines: declines.length,
            reviewersApproved,
            reviewersRequestedChanges,
            firstReviewTime,
        };
    }
}

schedule.scheduleJob('20 * * * * *', () => {
    BitbucketPRProcessorService.checkToProcess();
});
