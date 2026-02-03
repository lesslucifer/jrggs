import { AnyBulkWriteOperation } from "mongodb";
import schedule from 'node-schedule';
import HC from "../../glob/hc";
import AppConfig from "../../models/app-config";
import BitbucketPR, { BitbucketPRSyncStatus, IBitbucketPR, IBitbucketPRData } from "../../models/bitbucket-pr.mongo";
import { Locked } from "../../utils/async-lock-ext";
import { Catch } from "../../utils/decors";
import { BitbucketService } from "../bitbucket";
import { BitbucketPRProcessorService } from "./bitbucket-pr-process";

export class SyncBitbucketPRs {
    @Locked(() => 'SyncBitbucketPRs')
    @Catch(err => console.log(err))
    static async process(): Promise<void> {
        const workspace = HC.BITBUCKET_WORKSPACE;
        const repoSlug = HC.BITBUCKET_REPO_SLUG;

        await this.syncRepository(workspace, repoSlug);

        BitbucketPRProcessorService.checkToProcess();
    }

    static async syncRepository(workspace: string, repoSlug: string): Promise<void> {
        const configKey = `SyncBitbucketPRs_lastUpdateTime_${workspace}_${repoSlug}`;
        const lastUpdateTimeConfig = await AppConfig.findOne({ key: configKey });
        const lastUpdateTime = lastUpdateTimeConfig?.value as number || HC.SYNC_PRS_DEFAULT_LAST_UPDATE_TIME;

        const prs = await BitbucketService.queryPullRequests(workspace, repoSlug, lastUpdateTime, 100);

        if (prs.length === 0) {
            console.log(`[SyncBitbucketPRs] No new PRs to sync for ${workspace}/${repoSlug}`);
            return;
        }

        console.log(`[SyncBitbucketPRs] Syncing ${prs.length} PRs for ${workspace}/${repoSlug}`);

        const bulkOps: AnyBulkWriteOperation<IBitbucketPR>[] = prs.map(pr => ({
            updateOne: {
                filter: { prId: pr.id, workspace, repoSlug },
                update: {
                    $set: {
                        data: pr,
                        syncStatus: BitbucketPRSyncStatus.PENDING,
                        lastSyncAt: Date.now()
                    },
                    $setOnInsert: {
                        prId: pr.id,
                        workspace,
                        repoSlug,
                        activity: [],
                        commits: [],
                        computedData: {
                            totalComments: 0,
                            totalApprovals: 0,
                            totalDeclines: 0,
                            reviewersApproved: [],
                            reviewersRequestedChanges: []
                        }
                    }
                },
                upsert: true
            }
        }));

        await BitbucketPR.bulkWrite(bulkOps);

        const newestTimestamp = this.extractNewestUpdateTimestamp(prs);
        if (newestTimestamp && newestTimestamp > lastUpdateTime) {
            await AppConfig.updateOne(
                { key: configKey },
                { $set: { value: newestTimestamp + 1 } },
                { upsert: true }
            );
        }
    }

    private static extractNewestUpdateTimestamp(prs: IBitbucketPRData[]): number {
        let newestTimestamp = 0;

        for (const pr of prs) {
            const updatedStr = pr.updated_on;
            if (updatedStr) {
                const timestamp = new Date(updatedStr).getTime();
                if (!isNaN(timestamp) && timestamp > newestTimestamp) {
                    newestTimestamp = timestamp;
                }
            }
        }

        return newestTimestamp;
    }
}

schedule.scheduleJob('0 * * * * *', () => SyncBitbucketPRs.process().catch((err) => console.error(err)));
