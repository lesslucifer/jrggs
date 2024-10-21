import { ExpressRouter, GET, PUT, Params, Body } from "express-router-ts";
import _ from "lodash";
import moment from "moment";
import { Filter } from "mongodb";
import JiraIssue, { IJiraIssue, IJiraIssueMetrics } from "../models/jira-issue.mongo";
import { AppLogicError } from "../utils/hera";
import { AuthServ } from "../serv/auth";
import { USER_ROLE } from "../glob/cf";
import { ValidBody } from "../utils/decors";
import JiraIssueOverrides from "../models/jira-issue-overrides.mongo";
import JiraObject from "../models/jira-object.mongo";
import { JiraIssueData } from "../serv/jira";

class JiraIssueRouter extends ExpressRouter {
    document = {
        'tags': ['Jira Issues']
    }

    @AuthServ.authUser()
    @GET({ path: "/:key" })
    async getIssueByKey(@Params('key') key: string) {
        const issue = await JiraIssue.findOne({ key });
        const data = new JiraIssueData(issue.data)
        return {
            key: issue.key,
            title: data.summary,
            storyPoints: data.storyPoint,
            extraData: issue.extraData ?? {},
            metrics: issue.metrics,
            completedAt: issue.completedAt,
            completedSprint: issue.completedSprint
        };
    }

    @AuthServ.authUser(USER_ROLE.ADMIN)
    @ValidBody({
        '+@{}storyPoints': 'number|>0'
    })
    @PUT({ path: "/:key/storypoints" })
    async updateStoryPointsOverride(@Params('key') key: string, @Body() body: { storyPoints: Record<string, number> }) {
        const issue = await JiraIssue.findOne({ key }, { projection: { _id: 1, key: 1 } });
        if (!issue) {
            throw new AppLogicError(`Issue with key ${key} not found`, 404);
        }

        const uids = Object.keys(body.storyPoints)
        const userObjects = await JiraObject.find({ id: { $in: uids }, type: 'user' }, { projection: { _id: 1, id: 1 } }).toArray();
        const userMap = _.keyBy(userObjects, 'id')
        const notFoundUsers = uids.filter(uid => !userMap[uid]) 
        if (notFoundUsers.length > 0) {
            throw new AppLogicError(`Some users not found: ${notFoundUsers.join(', ')}`, 404);
        }

        const overrides = await JiraIssueOverrides.findOneAndUpdate(
            { key },
            { $set: { storyPoints: body.storyPoints } },
            { upsert: true }
        );

        return overrides;
    }
}

export default new JiraIssueRouter();
