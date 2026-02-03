import { ExpressRouter, GET, PUT, Params, Query } from "express-router-ts";
import { USER_ROLE } from "../glob/cf";
import BitbucketPR, { BitbucketPRSyncStatus } from "../models/bitbucket-pr.mongo";
import { AuthServ } from "../serv/auth";
import { AppLogicError } from "../utils/hera";
import { BitbucketPRProcessorService } from "../serv/jrggs/bitbucket-pr-process";

class BitbucketPRRouter extends ExpressRouter {
    document = {
        'tags': ['Bitbucket PRs']
    };

    @AuthServ.authUser(USER_ROLE.USER)
    @GET({ path: "/:workspace/:repoSlug/:prId" })
    async getPRById(@Params('workspace') workspace: string, @Params('repoSlug') repoSlug: string, @Params('prId') sPrId: string) {
        const prId = parseInt(sPrId);
        const pr = await BitbucketPR.findOne({ prId, workspace, repoSlug });

        if (!pr) {
            throw new AppLogicError(`PR ${prId} not found in ${workspace}/${repoSlug}`, 404);
        }

        const data = pr.data;
        return {
            prId: pr.prId,
            data: data,
            title: data.title,
            description: data.description,
            state: data.state,
            author: data.author,
            createdOn: data.created_on,
            updatedOn: data.updated_on,
            sourceBranch: data.source.branch.name,
            destinationBranch: data.destination.branch.name,
            computedData: pr.computedData,
            syncStatus: pr.syncStatus,
            lastSyncAt: pr.lastSyncAt
        };
    }

    @AuthServ.authUser(USER_ROLE.USER)
    @GET({ path: "/:workspace/:repoSlug" })
    async getPRsByRepo(@Params('workspace') workspace: string, @Params('repoSlug') repoSlug: string, @Query('state') state?: string) {
        const filter: any = { workspace, repoSlug };

        if (state) {
            filter['data.state'] = state.toUpperCase();
        }

        const prs = await BitbucketPR.find(filter, { sort: { 'data.updated_on': -1 } }).limit(100).toArray();

        return prs.map(pr => {
            const data = pr.data;
            return {
                prId: pr.prId,
                data: data,
                title: data.title,
                description: data.description,
                state: data.state,
                author: data.author,
                createdOn: data.created_on,
                updatedOn: data.updated_on,
                sourceBranch: data.source.branch.name,
                destinationBranch: data.destination.branch.name,
                computedData: pr.computedData,
                syncStatus: pr.syncStatus,
                lastSyncAt: pr.lastSyncAt
            };
        });
    }

    @AuthServ.authUser(USER_ROLE.USER)
    @GET({ path: "/:workspace/:repoSlug/:prId/activity" })
    async getPRActivity(@Params('workspace') workspace: string, @Params('repoSlug') repoSlug: string, @Params('prId') sPrId: string) {
        const prId = parseInt(sPrId);
        const pr = await BitbucketPR.findOne({ prId, workspace, repoSlug }, { projection: { activity: 1, prId: 1 } });

        if (!pr) {
            throw new AppLogicError(`PR ${prId} not found in ${workspace}/${repoSlug}`, 404);
        }

        return {
            prId: pr.prId,
            activity: pr.activity
        };
    }

    @AuthServ.authUser(USER_ROLE.USER)
    @GET({ path: "/:workspace/:repoSlug/:prId/commits" })
    async getPRCommits(@Params('workspace') workspace: string, @Params('repoSlug') repoSlug: string, @Params('prId') sPrId: string) {
        const prId = parseInt(sPrId);
        const pr = await BitbucketPR.findOne({ prId, workspace, repoSlug }, { projection: { commits: 1, prId: 1 } });

        if (!pr) {
            throw new AppLogicError(`PR ${prId} not found in ${workspace}/${repoSlug}`, 404);
        }

        return {
            prId: pr.prId,
            commits: pr.commits
        };
    }

    @AuthServ.authUser(USER_ROLE.ADMIN)
    @PUT({ path: "/:workspace/:repoSlug/:prId/sync-status/PENDING" })
    async updateSyncStatusToPending(@Params('workspace') workspace: string, @Params('repoSlug') repoSlug: string, @Params('prId') sPrId: string) {
        const prId = parseInt(sPrId);
        const pr = await BitbucketPR.findOneAndUpdate(
            { prId, workspace, repoSlug },
            { $set: { syncStatus: BitbucketPRSyncStatus.PENDING, syncParams: { refreshActivity: true, refreshCommits: true } } }
        );

        if (!pr) {
            throw new AppLogicError(`PR ${prId} not found in ${workspace}/${repoSlug}`, 404);
        }

        BitbucketPRProcessorService.checkToProcess();
        return { success: true, prId };
    }

    @AuthServ.authUser(USER_ROLE.ADMIN)
    @PUT({ path: "/:workspace/:repoSlug/sync-all" })
    async syncAllPRs(@Params('workspace') workspace: string, @Params('repoSlug') repoSlug: string) {
        const result = await BitbucketPR.updateMany(
            { workspace, repoSlug },
            { $set: { syncStatus: BitbucketPRSyncStatus.PENDING, syncParams: { refreshActivity: true, refreshCommits: true } } }
        );

        BitbucketPRProcessorService.checkToProcess();
        return { success: true, modifiedCount: result.modifiedCount };
    }
}

export default new BitbucketPRRouter();
