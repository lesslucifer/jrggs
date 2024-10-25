import { Body, DELETE, ExpressRouter, GET, Params, POST, PUT, Query } from "express-router-ts";
import { GQLGlobal, GQLU } from "gql-ts";
import _ from "lodash";
import { USER_ROLE } from "../glob/cf";
import HC from "../glob/hc";
import AppConfig from "../models/app-config";
import JiraIssue from "../models/jira-issue.mongo";
import { GQLJiraObject } from "../models/jira-object.gql";
import JiraObject, { IJiraObject } from "../models/jira-object.mongo";
import AuthServ from "../serv/auth";
import { JIRAService } from "../serv/jira";
import { DocGQLResponse, ValidBody } from "../utils/decors";
import { AppLogicError } from "../utils/hera";

class JiraObjectRouter extends ExpressRouter {
    document = {
        'tags': ['Jira Objects']
    }

    @AuthServ.authUser(USER_ROLE.ADMIN)
    @POST({ path: "/sync/users" })
    async syncJiraUsers() {
        const lastSyncTimeKey = 'syncJiraUsers_lastSyncTime_2'
        const lastSyncTimeConfig = await AppConfig.findOne({ key: lastSyncTimeKey })
        const lastSyncTime = lastSyncTimeConfig?.value as number || 0
        const issues = await JiraIssue.find({ lastSyncAt: { $gte: lastSyncTime } }).toArray()
        if (issues.length === 0) return

        const objects = await JiraObject.find({}).toArray()
        const jiraObjects = new Map<string, IJiraObject>(objects.map(obj => [obj.id, obj]))

        issues.forEach(issue => {
            issue.changelog.forEach(change => {
                if (change.author?.accountId) {
                    jiraObjects.set(change.author.accountId, {
                        id: change.author.accountId,
                        type: 'user',
                        lastUpdatedAt: Date.now(),
                        fields: {
                            ...jiraObjects.get(change.author.accountId)?.fields,
                            displayName: change.author.displayName,
                            avatarUrl: change.author.avatarUrls?.['48x48'] || _.last(Object.values(change.author.avatarUrls || {}))
                        },
                    })
                }
            })
        })

        const bulkOps = Array.from(jiraObjects.values()).map(obj => ({
            updateOne: {
                filter: { id: obj.id },
                update: { $set: obj },
                upsert: true
            }
        }))
        await JiraObject.bulkWrite(bulkOps)
        await AppConfig.updateOne({ key: lastSyncTimeKey }, { $set: { value: Date.now() } }, { upsert: true })
    }

    @AuthServ.authUser(USER_ROLE.ADMIN)
    @POST({ path: "/sync/sprints" })
    async syncJiraSprints() {
        const sprints = []
        for (const project of HC.JIRA_PROJECT_KEYS) {
            const projectSprints = await JIRAService.getProjectSprints(project)
            sprints.push(...projectSprints)
        }
        const bulkOps = sprints.flatMap(sprint => [{
            updateOne: {
                filter: { id: sprint.id.toString() },
                update: {
                    $set: {
                        type: 'sprint',
                        lastUpdatedAt: Date.now(),
                        'fields.displayName': sprint.name
                    }
                },
                upsert: true
            }
        }, {
            updateOne: {
                filter: { id: sprint.id.toString(), 'fields.projectCode': { $exists: false } },
                update: {
                    $set: {
                        'fields.projectCode': sprint.projectKey
                    }
                }
            }
        }])
        await JiraObject.bulkWrite(bulkOps)
    }

    @AuthServ.authUser(USER_ROLE.USER, USER_ROLE.ADMIN)
    @GET({ path: "/" })
    @DocGQLResponse(GQLJiraObject)
    async getJiraObjects(@Query() query: Record<string, string>) {
        const q = GQLGlobal.queryFromHttpQuery(query, GQLJiraObject);
        GQLU.whiteListFilter(q, 'id', 'type', 'query');

        return await q.resolve();
    }

    @AuthServ.authUser(USER_ROLE.ADMIN)
    @PUT({ path: "/:id" })
    @ValidBody({
        '@type?': 'string',
        '@{}fields?': 'string',
        '++': false
    })
    async updateJiraObject(@Params('id') id: string, @Body() body: Partial<IJiraObject>) {
        const result = await JiraObject.updateOne({ id }, {
            $set: {
                ...body,
                lastUpdatedAt: Date.now()
            }
        });
        if (result.matchedCount === 0) {
            throw new AppLogicError('Jira object not found', 404);
        }
        return { updated: result.modifiedCount > 0 };
    }

    @AuthServ.authUser(USER_ROLE.ADMIN)
    @DELETE({ path: "/:id" })
    async deleteJiraObject(@Params('id') id: string) {
        const result = await JiraObject.deleteOne({ id });
        if (result.deletedCount === 0) {
            throw new AppLogicError('Jira object not found', 404);
        }
    }

    @AuthServ.authUser(USER_ROLE.ADMIN)
    @ValidBody({
        '@code?': 'string',
        '@abbrev?': 'string',
        '@displayName?': 'string',
        '@avatarUrl?': 'string',
        '@role?': 'string',
        '@color?': 'string',
        '@projectCode?': 'string',
        '++': false
    })
    @PUT({ path: "/:id/fields" })
    async updateJiraFields(@Params('id') id: string, @Body() body: Partial<IJiraObject['fields']>) {
        if (!Object.keys(body).length) return

        const result = await JiraObject.updateOne({ id }, {
            $set: {
                lastUpdatedAt: Date.now(),
                ...Object.fromEntries(Object.entries(body).map(([k, v]) => [`fields.${k}`, v ?? undefined])),
            }
        });
        if (result.matchedCount === 0) {
            throw new AppLogicError('Jira object not found', 404);
        }
    }
}

export default new JiraObjectRouter();
