import { Body, ExpressRouter, GET, PUT, Params, Query } from "express-router-ts";
import { USER_ROLE } from "../glob/cf";
import BitbucketPR, { BitbucketPRSyncStatus, IBitbucketPR, IBitbucketPRComputedData } from "../models/bitbucket-pr.mongo";
import { AuthServ } from "../serv/auth";
import { AppLogicError } from "../utils/hera";
import { BitbucketPRProcessorService } from "../serv/jrggs/bitbucket-pr-process";
import { ValidBody, DocGQLResponse } from "../utils/decors";
import _ from "lodash";
import { GQLFieldFilter, GQLGlobal, GQLU } from "gql-ts";
import { GQLBitbucketPR } from "../models/bitbucket-pr.gql";
import JiraIssue, { JiraIssueSyncStatus } from "../models/jira-issue.mongo";

class BitbucketPRRouter extends ExpressRouter {
    document = {
        'tags': ['Bitbucket PRs']
    };

    @AuthServ.authUser(USER_ROLE.USER)
    @GET({ path: "/:workspace/:repoSlug/:prId" })
    @DocGQLResponse(GQLBitbucketPR)
    async getPRById(@Params('workspace') workspace: string, @Params('repoSlug') repoSlug: string, @Params('prId') sPrId: string, @Query() query: Record<string, string>) {
        const prId = parseInt(sPrId);

        const q = GQLGlobal.queryFromHttpQuery(query, GQLBitbucketPR);
        GQLU.whiteListFilter(q);

        q.filter.add(new GQLFieldFilter('prId', prId.toString()));
        q.filter.add(new GQLFieldFilter('workspace', workspace));
        q.filter.add(new GQLFieldFilter('repoSlug', repoSlug));
        q.options.one = true;

        const result = await q.resolve();

        if (!result) {
            throw new AppLogicError(`PR ${prId} not found in ${workspace}/${repoSlug}`, 404);
        }

        return result;
    }

    @AuthServ.authUser(USER_ROLE.USER)
    @GET({ path: "/by-jira-issue/:issueKey" })
    @DocGQLResponse(GQLBitbucketPR)
    async getPRsByJiraIssue(
        @Params('issueKey') issueKey: string,
        @Query() query: Record<string, string>
    ) {
        const q = GQLGlobal.queryFromHttpQuery(query, GQLBitbucketPR);
        GQLU.whiteListFilter(q, 'q');

        q.filter.add(new GQLFieldFilter('linkedJiraIssues', issueKey));
        q.filter.add(new GQLFieldFilter('status', 'MERGED'))

        return await q.resolve();
    }

    @AuthServ.authUser(USER_ROLE.USER)
    @GET({ path: "/unresolved-merged" })
    @DocGQLResponse(GQLBitbucketPR)
    async getUnresolvedMergedPRs(@Query() query: Record<string, string>) {
        const q = GQLGlobal.queryFromHttpQuery(query, GQLBitbucketPR);
        GQLU.whiteListFilter(q, 'workspace', 'repoSlug', 'q');

        q.filter.add(new GQLFieldFilter('unresolved', true));

        return await q.resolve();
    }

    @AuthServ.authUser(USER_ROLE.USER)
    @GET({ path: "/:workspace/:repoSlug" })
    @DocGQLResponse(GQLBitbucketPR)
    async getPRsByRepo(
        @Params('workspace') workspace: string,
        @Params('repoSlug') repoSlug: string,
        @Query() query: Record<string, string>
    ) {
        const q = GQLGlobal.queryFromHttpQuery(query, GQLBitbucketPR);
        GQLU.whiteListFilter(q, 'status', 'q');

        q.filter.add(new GQLFieldFilter('workspace', workspace));
        q.filter.add(new GQLFieldFilter('repoSlug', repoSlug));

        const prs = await q.resolve();
        return prs
    }

    @AuthServ.authUser(USER_ROLE.USER)
    @GET({ path: "/:workspace/:repoSlug/:prId/activity" })
    @DocGQLResponse(GQLBitbucketPR)
    async getPRActivity(@Params('workspace') workspace: string, @Params('repoSlug') repoSlug: string, @Params('prId') sPrId: string, @Query() query: Record<string, string>) {
        const prId = parseInt(sPrId);

        const q = GQLGlobal.queryFromHttpQuery(query, GQLBitbucketPR);
        GQLU.whiteListFilter(q);

        q.filter.add(new GQLFieldFilter('prId', prId.toString()));
        q.filter.add(new GQLFieldFilter('workspace', workspace));
        q.filter.add(new GQLFieldFilter('repoSlug', repoSlug));
        q.options.one = true;

        const result = await q.resolve();

        if (!result) {
            throw new AppLogicError(`PR ${prId} not found in ${workspace}/${repoSlug}`, 404);
        }

        return result;
    }

    @AuthServ.authUser(USER_ROLE.USER)
    @GET({ path: "/:workspace/:repoSlug/:prId/commits" })
    @DocGQLResponse(GQLBitbucketPR)
    async getPRCommits(@Params('workspace') workspace: string, @Params('repoSlug') repoSlug: string, @Params('prId') sPrId: string, @Query() query: Record<string, string>) {
        const prId = parseInt(sPrId);

        const q = GQLGlobal.queryFromHttpQuery(query, GQLBitbucketPR);
        GQLU.whiteListFilter(q);

        q.filter.add(new GQLFieldFilter('prId', prId.toString()));
        q.filter.add(new GQLFieldFilter('workspace', workspace));
        q.filter.add(new GQLFieldFilter('repoSlug', repoSlug));
        q.options.one = true;

        const result = await q.resolve();

        if (!result) {
            throw new AppLogicError(`PR ${prId} not found in ${workspace}/${repoSlug}`, 404);
        }

        return result;
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
            { $set: { syncStatus: BitbucketPRSyncStatus.PENDING, syncParams: { refreshActivity: false, refreshCommits: false } } }
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

        const prUpdate: any = {};
        if (body.picAccountId !== undefined) {
            prUpdate['overrides.picAccountId'] = body.picAccountId;
        }
        if (body.points !== undefined) {
            prUpdate['overrides.points'] = body.points;
        }
        if (body.computedData !== undefined) {
            prUpdate['overrides.computedData'] = _.omitBy(body.computedData, _.isNil);
        }

        const pr = await BitbucketPR.findOneAndUpdate(
            { prId, workspace, repoSlug },
            {
                $set: {
                    ...prUpdate,
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
    @ValidBody({
        '@issueKey': 'string',
        '++': false
    })
    @PUT({ path: "/:workspace/:repoSlug/:prId/activeLinkedIssueKey" })
    async setActiveLinkedIssue(
        @Params('workspace') workspace: string,
        @Params('repoSlug') repoSlug: string,
        @Params('prId') sPrId: string,
        @Body() body: { issueKey: string | null }
    ) {
        const prId = parseInt(sPrId);

        const pr = await BitbucketPR.findOne({ prId, workspace, repoSlug });
        if (!pr) {
            throw new AppLogicError(`PR ${prId} not found in ${workspace}/${repoSlug}`, 404);
        }

        await BitbucketPR.updateOne(
            { prId, workspace, repoSlug },
            {
                $set: {
                    activeLinkedIssueKey: body.issueKey,
                    syncStatus: BitbucketPRSyncStatus.PENDING
                },
                ...(body.issueKey && !pr.linkedJiraIssues?.includes(body.issueKey) ? {
                    $push: { linkedJiraIssues: body.issueKey }
                } : {})
            }
        );

        if (pr.activeLinkedIssueKey) {
            await JiraIssue.updateOne(
                { key: pr.activeLinkedIssueKey },
                { $set: { syncStatus: JiraIssueSyncStatus.PENDING, syncParams: {
                    skipHistory: true,
                    skipChangeLog: true,
                    skipDevInCharge: true
                } } }
            );
        }

        BitbucketPRProcessorService.checkToProcess();
        return { prId, activeLinkedIssueKey: body.issueKey };
    }
}

export default new BitbucketPRRouter();

