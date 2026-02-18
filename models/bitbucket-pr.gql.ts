import { GQLField, GQLGlobal, GQLIdenticalMapping, GQLMapper, GQLModel, GQLObject, GQLQuery, GQLResolver, GQLU } from "gql-ts";
import hera from "../utils/hera";
import BitbucketPR, { BitbucketPRSyncStatus, IBitbucketPR } from "./bitbucket-pr.mongo";
import _ from "lodash";

@GQLObject("bitbucket-pr")
export class GQLBitbucketPR extends GQLModel<IBitbucketPR, GQLBitbucketPR> {
    @GQLField()
    _id: string;

    @GQLField()
    prId: string;

    @GQLField()
    workspace: string;

    @GQLField()
    repoSlug: string;

    @GQLField()
    syncStatus: BitbucketPRSyncStatus;

    @GQLField()
    lastSyncAt: number;

    @GQLField({ autoSelect: false })
    @GQLIdenticalMapping()
    data: any;

    @GQLField({ autoSelect: false })
    @GQLIdenticalMapping()
    activity: any[];

    @GQLField({ autoSelect: false })
    @GQLIdenticalMapping()
    commits: any[];

    @GQLField({ autoSelect: false })
    @GQLIdenticalMapping()
    computedData: any;

    @GQLField({ autoSelect: false })
    @GQLIdenticalMapping()
    overrides: any;

    @GQLField()
    status?: string;

    @GQLField()
    @GQLIdenticalMapping()
    linkedJiraIssues: string[];

    @GQLField()
    @GQLIdenticalMapping()
    activeLinkedIssueKey?: string;

    @GQLField()
    title?: string

    @GQLField()
    description?: string;

    @GQLField()
    state?: string;

    @GQLField()
    author?: any;

    @GQLField()
    createdOn?: string;

    @GQLField()
    updatedOn?: string;

    @GQLField()
    sourceBranch?: string;

    @GQLField()
    destinationBranch?: string;

    @GQLField()
    points?: number

    static get DefaultSelect() {
        return {
            _id: true,
            prId: true,
            workspace: true,
            repoSlug: true,
            syncStatus: true,
            status: true,
            linkedJiraIssues: true,
            activeLinkedIssueKey: true
        };
    }

    @GQLResolver({ matches: GQLU.byFields([], ['prId', 'workspace', 'repoSlug', 'status', 'linkedJiraIssues', 'activeLinkedIssueKey', 'syncStatus', 'q']) })
    static async rootResolve(query: GQLQuery<GQLBitbucketPR>) {
        const prIds = query.filter.get('prId').batch<string>()
        const workspaces = query.filter.get('workspace').batch<string>();
        const repoSlugs = query.filter.get('repoSlug').batch<string>();
        const statuses = query.filter.get('status').batch<string>();
        const linkedJiraIssuesFilter = query.filter.get('linkedJiraIssues').batch<string>();
        const activeLinkedIssueKeyFilter = query.filter.get('activeLinkedIssueKey').first<string>();
        const syncStatuses = query.filter.get('syncStatus').batch<string>();
        const textQuery = query.filter.get('q').first();

        const mongoQuery = GQLU.notEmpty({
            prId: hera.mongoEqOrIn(prIds),
            workspace: hera.mongoEqOrIn(workspaces),
            repoSlug: hera.mongoEqOrIn(repoSlugs),
            status: hera.mongoEqOrIn(statuses),
            linkedJiraIssues: linkedJiraIssuesFilter.length > 0 ? { $in: linkedJiraIssuesFilter.map(k => k.toUpperCase()) } : undefined,
            activeLinkedIssueKey: activeLinkedIssueKeyFilter ? activeLinkedIssueKeyFilter.toUpperCase() : undefined,
            syncStatus: hera.mongoEqOrIn(syncStatuses),
            ...(textQuery ? { $text: { $search: textQuery } } : {})
        });

        const result = await hera.gqlMongoQueryPagination(
            GQLBitbucketPR,
            query,
            BitbucketPR,
            mongoQuery,
            { defaultLimit: 100, maxLimit: 500 }
        );

        return result;
    }

    @GQLResolver({ matches: GQLU.byFields(['unresolved'], ['workspace', 'repoSlug', 'q']) })
    static async unresolvedMergedResolve(query: GQLQuery<GQLBitbucketPR>) {
        const workspaces = query.filter.get('workspace').batch<string>();
        const repoSlugs = query.filter.get('repoSlug').batch<string>();
        const textQuery = query.filter.get('q').first();

        const mongoQuery = GQLU.notEmpty({
            status: 'MERGED',
            workspace: hera.mongoEqOrIn(workspaces),
            repoSlug: hera.mongoEqOrIn(repoSlugs),
            $or: [
                { 'overrides.points': { $exists: false } },
                { 'overrides.points': null },
                { activeLinkedIssueKey: { $exists: false } },
                { activeLinkedIssueKey: { $in: [null, ''] } }
            ],
            ...(textQuery ? { $text: { $search: textQuery } } : {})
        });

        return await hera.gqlMongoQueryPagination(
            GQLBitbucketPR,
            query,
            BitbucketPR,
            mongoQuery,
            { defaultLimit: 100, maxLimit: 500 }
        );
    }

    @GQLMapper({ fields: ['title', 'description', 'state', 'author', 'createdOn', 'updatedOn', 'sourceBranch', 'destinationBranch'], addRawFields: ['data'] })
    static async mapDataFields(query: GQLQuery<GQLBitbucketPR>, models: GQLBitbucketPR[]) {
        models.forEach(model => {
            model.title = _.get(model.raw?.data, 'title', '');
            model.description = _.get(model.raw?.data, 'description', '');
            model.state = _.get(model.raw?.data, 'state', '');
            model.author = _.get(model.raw?.data, 'author');
            model.createdOn = _.get(model.raw?.data, 'created_on', '');
            model.updatedOn = _.get(model.raw?.data, 'updated_on', '');
            model.sourceBranch = _.get(model.raw?.data, 'source.branch.name', '');
            model.destinationBranch = _.get(model.raw?.data, 'destination.branch.name', '');
        });
        return models;
    }

    @GQLMapper({ fields: ['points'], addRawFields: ['overrides'] })
    static async mapPoints(query: GQLQuery<GQLBitbucketPR>, models: GQLBitbucketPR[]) {
        models.forEach(model => {
            model.points = _.get(model.raw?.overrides, 'points');
        }); 
        return models
    }
}

GQLGlobal.add(GQLBitbucketPR)