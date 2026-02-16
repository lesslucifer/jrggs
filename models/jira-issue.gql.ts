import { GQLField, GQLGlobal, GQLIdenticalMapping, GQLMapper, GQLModel, GQLObject, GQLQuery, GQLResolver, GQLU } from "gql-ts";
import hera from "../utils/hera";
import JiraIssue, { IJiraIssue, JiraIssueSyncStatus } from "./jira-issue.mongo";
import _ from "lodash";

@GQLObject("jira-issue")
export class GQLJiraIssue extends GQLModel<IJiraIssue, GQLJiraIssue> {
    @GQLField()
    _id: string;

    @GQLField()
    key: string;

    @GQLField()
    syncStatus: JiraIssueSyncStatus;

    @GQLField()
    lastSyncAt: number;

    @GQLField({ autoSelect: false })
    @GQLIdenticalMapping()
    data: Record<string, any>;

    @GQLField({ autoSelect: false })
    @GQLIdenticalMapping()
    history: any[];

    @GQLField({ autoSelect: false })
    @GQLIdenticalMapping()
    current: any;

    @GQLField({ autoSelect: false })
    @GQLIdenticalMapping()
    changelog: any[];

    @GQLField({ autoSelect: true })
    @GQLIdenticalMapping()
    metrics: Record<string, any>;

    @GQLField({ autoSelect: true })
    @GQLIdenticalMapping()
    extraData: any;

    @GQLField()
    completedAt?: number;

    @GQLField({ autoSelect: true })
    @GQLIdenticalMapping()
    completedSprint?: any;

    @GQLField()
    @GQLIdenticalMapping()
    sprintIds: number[];

    @GQLField()
    @GQLIdenticalMapping()
    inChargeDevs: string[];

    @GQLField()
    title?: string;

    @GQLField()
    type?: string;

    @GQLField()
    severity?: string;

    @GQLField()
    status?: string;

    @GQLField()
    storyPoints?: number;

    @GQLField()
    estSP?: number;

    @GQLField()
    assignee?: any;

    @GQLField()
    assigneeId?: string;

    @GQLField()
    isSubTask?: boolean;

    @GQLField()
    isExcluded?: boolean;

    static get DefaultSelect() {
        return {
            _id: true,
            key: true,
            syncStatus: true,
            sprintIds: true,
            inChargeDevs: true
        };
    }

    @GQLResolver({ matches: GQLU.byFields([], ['key', 'sprintIds', 'syncStatus', 'completedAt', 'inChargeDevs']) })
    static async rootResolve(query: GQLQuery<GQLJiraIssue>) {
        const keys = query.filter.get('key').batch<string>();
        const sprintIdsFilter = query.filter.get('sprintIds').batch<string>();
        const syncStatuses = query.filter.get('syncStatus').batch<string>();
        const completedAtFilter = query.filter.get('completedAt').first<string>();
        const inChargeDevsFilter = query.filter.get('inChargeDevs').batch<string>();

        const mongoQuery = GQLU.notEmpty({
            key: hera.mongoEqOrIn(keys),
            sprintIds: sprintIdsFilter.length > 0 ? { $in: sprintIdsFilter.map(id => parseInt(id)) } : undefined,
            syncStatus: hera.mongoEqOrIn(syncStatuses),
            completedAt: completedAtFilter ? parseInt(completedAtFilter) : undefined,
            inChargeDevs: inChargeDevsFilter.length > 0 ? { $in: inChargeDevsFilter } : undefined
        });

        const result = await hera.gqlMongoQueryPagination(
            GQLJiraIssue,
            query,
            JiraIssue,
            mongoQuery,
            { defaultLimit: 100, maxLimit: 1000 }
        );

        return result;
    }

    @GQLMapper({ fields: ['title', 'type', 'severity', 'status', 'storyPoints', 'estSP', 'assignee', 'assigneeId', 'isSubTask', 'isExcluded'], addRawFields: ['data', 'extraData'] })
    static async map(query: GQLQuery<GQLJiraIssue>, models: GQLJiraIssue[]) {
        models.forEach(model => {
            model.title = _.get(model.raw?.data, 'fields.summary', '');
            model.type = _.get(model.raw?.data, 'fields.issuetype.name', '');
            model.severity = _.get(model.data, 'fields.priority.name', 'S3-Moderate');
            model.status = _.get(model.raw?.data, 'fields.status.name', '');
            model.storyPoints = _.get(model.raw?.data, 'fields.customfield_10033', 0);
            model.assignee = _.get(model.raw?.data, 'fields.assignee');
            model.assigneeId = _.get(model.raw?.data, 'fields.assignee.accountId', '');

            const lowerCaseStatus = model.status?.toLowerCase();
            const STATUS_SP_EST: Record<string, number> = {
                'done': 1,
                'in review': 0.8,
                'in progress': 0.5,
                'to do': 0,
                'backlog': 0
            };
            model.estSP = model.storyPoints * (STATUS_SP_EST[lowerCaseStatus] ?? 1);
            model.isSubTask = model.type === 'Sub-task';
            model.isExcluded = _.get(model.extraData, 'excluded', false) === true;
        });
        return models;
    }
}

GQLGlobal.add(GQLJiraIssue);
