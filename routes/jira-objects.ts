import { Body, DELETE, ExpressRouter, GET, Params, POST, PUT, Query } from "express-router-ts";
import { GQLGlobal, GQLU } from "gql-ts";
import { GQLJiraObject } from "../models/jira-object.gql";
import JiraObject, { IJiraObject } from "../models/jira-object.mongo";
import { DocGQLResponse, ValidBody } from "../utils/decors";
import { AppLogicError } from "../utils/hera";
import { USER_ROLE } from "../glob/cf";
import AuthServ from "../serv/auth";
import AppConfig from "../models/app-config";
import { query } from "express";
import _, { result } from "lodash";
import { AnyBulkWriteOperation } from "mongodb";
import JiraIssue, { IJiraIssue, IJiraUserInfo } from "../models/jira-issue.mongo";

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
        const lastSyncTimeConfig = await AppConfig.findOne({ key: 'syncJiraObjects_lastSyncTime' })
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
        
        await AppConfig.updateOne({ key: 'syncJiraObjects_lastSyncTime' }, { $set: { value: Date.now() } }, { upsert: true })
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
