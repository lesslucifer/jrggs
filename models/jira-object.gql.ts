import { GQLField, GQLGlobal, GQLIdenticalMapping, GQLModel, GQLObject, GQLQuery, GQLResolver, GQLU } from "gql-ts";
import hera from "../utils/hera";
import JiraObject, { IJiraObject } from "./jira-object.mongo";

@GQLObject("jira-object")
export class GQLJiraObject extends GQLModel<IJiraObject, GQLJiraObject> {
    @GQLField()
    id: string;

    @GQLField()
    type: string;

    @GQLField({ autoSelect: true })
    @GQLIdenticalMapping()
    fields: {
        code?: string;
        abbrev?: string;
        displayName?: string;
        avatarUrl?: string;
        color?: string;

        [key: string]: string;
    };

    static get DefaultSelect() {
        return { id: true, type: true }
    }

    @GQLResolver({ matches: GQLU.byFields([], ['id', 'type', 'query']) })
    static async rootResolve(query: GQLQuery) {
        const ids = query.filter.get('id').batch<string>();
        const types = query.filter.get('type').batch<string>();
        const textQuery = query.filter.get('query').first();

        const q = GQLU.notEmpty({
            id: hera.mongoEqOrIn(ids),
            type: hera.mongoEqOrIn(types),
            ...(textQuery ? { $text: { $search: textQuery } } : {})
        });

        return await hera.gqlMongoQueryPagination(GQLJiraObject, query, JiraObject, q, {defaultLimit: 1000, maxLimit: 10000})
    }
}

GQLGlobal.add(GQLJiraObject)