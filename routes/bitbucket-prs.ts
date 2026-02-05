import { Body, ExpressRouter, GET, PUT, DELETE, Params, Query } from "express-router-ts";
import { USER_ROLE } from "../glob/cf";
import BitbucketPR, { BitbucketPRSyncStatus, IBitbucketPRComputedData } from "../models/bitbucket-pr.mongo";
import { AuthServ } from "../serv/auth";
import { AppLogicError } from "../utils/hera";
import { BitbucketPRProcessorService } from "../serv/jrggs/bitbucket-pr-process";
import { ValidBody } from "../utils/decors";
import _ from "lodash";

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
            workspace,
            repoSlug,
            data: data,
            title: data.title,
            description: data.description,
            state: data.state,
            status: pr.status,
            author: data.author,
            createdOn: data.created_on,
            updatedOn: data.updated_on,
            sourceBranch: data.source.branch.name,
            destinationBranch: data.destination.branch.name,
            computedData: pr.computedData,
            overrides: pr.overrides,
            syncStatus: pr.syncStatus,
            lastSyncAt: pr.lastSyncAt
        };
    }

    @AuthServ.authUser(USER_ROLE.USER)
    @GET({ path: "/:workspace/:repoSlug" })
    async getPRsByRepo(
        @Params('workspace') workspace: string,
        @Params('repoSlug') repoSlug: string,
        @Query('status') status?: string,
        @Query('skip') sSkip?: string,
        @Query('limit') sLimit?: string
    ) {
        const filter: any = { workspace, repoSlug };

        // Support multiple status values (comma-separated)
        if (status) {
            const statusValues = status.split(',').map(s => s.trim().toUpperCase()).filter(s => s);
            if (statusValues.length === 1) {
                filter['status'] = statusValues[0];
            } else if (statusValues.length > 1) {
                filter['status'] = { $in: statusValues };
            }
        }

        // Pagination parameters
        const skip = sSkip ? parseInt(sSkip) : 0;
        const limit = sLimit ? Math.min(parseInt(sLimit), 500) : 100;

        const prs = await BitbucketPR.find(filter, { sort: { 'data.updated_on': -1 } })
            .skip(skip)
            .limit(limit)
            .toArray();

        return prs.map(pr => {
            const data = pr.data;
            return {
                prId: pr.prId,
                workspace,
                repoSlug,
                data: data,
                title: data.title,
                description: data.description,
                state: data.state,
                status: pr.status,
                author: data.author,
                createdOn: data.created_on,
                updatedOn: data.updated_on,
                sourceBranch: data.source.branch.name,
                destinationBranch: data.destination.branch.name,
                computedData: pr.computedData,
                overrides: pr.overrides,
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

    @AuthServ.authUser(USER_ROLE.ADMIN)
    @ValidBody({
        '@picAccountId': 'string',
        '@points': 'number',
        '@computedData': {
            '@totalComments': 'number|>=0',
            '@totalApprovals': 'number|>=0',
            '@totalDeclines': 'number|>=0',
            '++': false
        },
        '++': false
    })
    @PUT({ path: "/:workspace/:repoSlug/:prId/overrides" })
    async updatePROverrides(
        @Params('workspace') workspace: string,
        @Params('repoSlug') repoSlug: string,
        @Params('prId') sPrId: string,
        @Body() body: {
            picAccountId?: string;
            points?: number;
            computedData?: Partial<IBitbucketPRComputedData>;
        }
    ) {
        const prId = parseInt(sPrId);

        const overrideUpdates: any = {};
        if (body.picAccountId !== undefined) {
            overrideUpdates['overrides.picAccountId'] = body.picAccountId;
        }
        if (body.points !== undefined) {
            overrideUpdates['overrides.points'] = body.points;
        }
        if (body.computedData !== undefined) {
            overrideUpdates['overrides.computedData'] = _.omitBy(body.computedData, _.isNil);
        }

        const pr = await BitbucketPR.findOneAndUpdate(
            { prId, workspace, repoSlug },
            {
                $set: {
                    ...overrideUpdates,
                    syncStatus: BitbucketPRSyncStatus.PENDING
                }
            }
        );

        if (!pr) {
            throw new AppLogicError(`PR ${prId} not found in ${workspace}/${repoSlug}`, 404);
        }

        BitbucketPRProcessorService.checkToProcess();
        return { prId };
    }

    @AuthServ.authUser(USER_ROLE.ADMIN)
    @PUT({ path: "/:workspace/:repoSlug/:prId/status/COMPLETED" })
    async setPRCompleted(
        @Params('workspace') workspace: string,
        @Params('repoSlug') repoSlug: string,
        @Params('prId') sPrId: string
    ) {
        const prId = parseInt(sPrId);
        const pr = await BitbucketPR.findOneAndUpdate(
            { prId, workspace, repoSlug },
            {
                $set: {
                    status: 'COMPLETED'
                }
            }
        );

        if (!pr) {
            throw new AppLogicError(`PR ${prId} not found in ${workspace}/${repoSlug}`, 404);
        }

        return { prId };
    }
}

export default new BitbucketPRRouter();
