import { Body, DELETE, ExpressRouter, GET, Params, POST, PUT, Query } from "express-router-ts";
import { GQLGlobal, GQLU } from "gql-ts";
import _ from "lodash";
import { USER_ROLE } from "../glob/cf";
import AppConfig from "../models/app-config";
import JiraIssue from "../models/jira-issue.mongo";
import { GQLJiraObject } from "../models/jira-object.gql";
import JiraObject, { IJiraObject } from "../models/jira-object.mongo";
import AuthServ from "../serv/auth";
import { DocGQLResponse, ValidBody } from "../utils/decors";
import { AppLogicError } from "../utils/hera";

class JiraObjectRouter extends ExpressRouter {
    document = {
        'tags': ['Jira Objects']
    }

    @AuthServ.authUser(USER_ROLE.ADMIN)
    @POST({ path: "/" })
    @ValidBody({
        '+@id': 'string',
        '+@type': 'string',
        '+{}@fields': 'string',
        '++': false
    })
    async createJiraObject(@Body() body: IJiraObject) {
        const existingObject = await JiraObject.findOne({ id: body.id });
        if (existingObject) {
            throw new AppLogicError('Jira object with this ID already exists', 400);
        }
        const result = await JiraObject.insertOne(body);
        return { _id: result.insertedId };
    }

    @AuthServ.authUser(USER_ROLE.ADMIN)
    @POST({ path: "/sync" })
    async syncJiraObjects() {
        const lastSyncTimeKey = 'syncJiraObjects_lastSyncTime_2'
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
                        fields: {
                            ...jiraObjects.get(change.author.accountId)?.fields,
                            displayName: change.author.displayName,
                            avatarUrl: change.author.avatarUrls?.['48x48'] || _.last(Object.values(change.author.avatarUrls || {}))
                        },
                    })
                }

                change.items?.forEach(item => {
                    if (item.field === 'status') {
                        jiraObjects.set(item.from, {
                            id: item.from,
                            type: 'status',
                            fields: {
                                ...jiraObjects.get(item.from)?.fields,
                                displayName: item.fromString,
                            }
                        })

                        jiraObjects.set(item.to, {
                            id: item.to,
                            type: 'status',
                            fields: {
                                ...jiraObjects.get(item.to)?.fields,
                                displayName: item.toString,
                            }
                        })
                    }

                    if (item.field === 'Sprint') {
                        const sprints = _.zip([...item.from.split(', '), ...item.to.split(', ')], [...item.fromString.split(', '), ...item.toString.split(', ')])
                        sprints.forEach(([id, name]) => {
                            if (!id || !name) return
                            jiraObjects.set(id, {
                                id,
                                type: 'sprint',
                                fields: {
                                    ...jiraObjects.get(id)?.fields,
                                    displayName: name,
                                }
                            })
                        })
                    }
                })
            })

            issue.comments.forEach(comment => {
                if (comment.author?.accountId) {
                    jiraObjects.set(comment.author.accountId, {
                        id: comment.author.accountId,
                        type: 'user',
                        fields: {
                            ...jiraObjects.get(comment.author.accountId)?.fields,
                            displayName: comment.author.displayName,
                            avatarUrl: comment.author.avatarUrls?.['48x48'] || _.last(Object.values(comment.author.avatarUrls || {}))
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
        const result = await JiraObject.updateOne({ id }, { $set: body });
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
}

export default new JiraObjectRouter();
