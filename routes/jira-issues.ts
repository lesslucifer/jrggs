import { Body, ExpressRouter, GET, PUT, Params } from "express-router-ts";
import _ from "lodash";
import { USER_ROLE } from "../glob/cf";
import JiraIssueOverrides from "../models/jira-issue-overrides.mongo";
import JiraIssue, { JiraIssueSyncStatus } from "../models/jira-issue.mongo";
import JiraObject from "../models/jira-object.mongo";
import { AuthServ } from "../serv/auth";
import { JiraIssueData } from "../serv/jira";
import { ValidBody } from "../utils/decors";
import { AppLogicError } from "../utils/hera";
import { IssueProcessorService } from "../serv/jrggs/issue-process";
import { GQLU } from "gql-ts";

class JiraIssueRouter extends ExpressRouter {
    document = {
        'tags': ['Jira Issues']
    }

    @AuthServ.authUser()
    @GET({ path: "/:key/metrics" })
    async getIssueMetrics(@Params('key') key: string) {
        const issue = await JiraIssue.findOne({ key });
        const data = new JiraIssueData(issue.data)
        return {
            key: issue.key,
            syncStatus: issue.syncStatus,
            metrics: issue.metrics
        };
    }

    @AuthServ.authUser()
    @GET({ path: "/:key" })
    async getIssueByKey(@Params('key') key: string) {
        const issue = await JiraIssue.findOne({ key });
        const data = new JiraIssueData(issue.data)
        return {
            key: issue.key,
            title: data.summary,
            type: data.type,
            severity: data.severity,
            storyPoints: data.storyPoint,
            extraData: issue.extraData ?? {},
            metrics: issue.metrics,
            completedAt: issue.completedAt,
            completedSprint: issue.completedSprint,
            syncStatus: issue.syncStatus
        };
    }

    @AuthServ.authUser(USER_ROLE.ADMIN)
    @ValidBody({
        '+@{}storyPoints': 'number|>0'
    })
    @PUT({ path: "/:key/overrides/storypoints" })
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

        await JiraIssue.updateOne({ key }, { $set: { 'extraData.storyPoints': body.storyPoints, syncStatus: JiraIssueSyncStatus.PENDING } });
        IssueProcessorService.checkToProcess()

        return overrides;
    }

    @AuthServ.authUser(USER_ROLE.ADMIN)
    @PUT({ path: "/:key/overrides/excluded/:isExcluded" })
    async updateExcludedOverride(@Params('key') key: string, @Params('isExcluded') sIsExcluded: string) {
        const isExcluded = GQLU.toBoolean(sIsExcluded)
        const issue = await JiraIssue.findOne({ key }, { projection: { _id: 1, key: 1 } });
        if (!issue) {
            throw new AppLogicError(`Issue with key ${key} not found`, 404);
        }

        const overrides = await JiraIssueOverrides.findOneAndUpdate(
            { key },
            { $set: { excluded: isExcluded } },
            { upsert: true }
        );

        await JiraIssue.updateOne({ key }, { $set: { 'extraData.excluded': isExcluded, syncStatus: JiraIssueSyncStatus.PENDING } });
        IssueProcessorService.checkToProcess()

        return overrides;
    }

    @AuthServ.authUser(USER_ROLE.ADMIN)
    @PUT({ path: "/:key/overrides/invalidChangelogIds/:changelogId/:invalid" })
    async updateChangelogInvalidation(@Params('key') key: string, @Params('changelogId') changelogId: string, @Params('invalid') sInvalid: string) {
        const isInvalid = GQLU.toBoolean(sInvalid)
        const issue = await JiraIssue.findOne({ key }, { projection: { _id: 1, key: 1, changelog: 1 } });
        if (!issue) {
            throw new AppLogicError(`Issue with key ${key} not found`, 404);
        }

        if (!issue.changelog.some(log => log.id === changelogId)) {
            throw new AppLogicError(`Changelog with id ${changelogId} not found`, 404);
        }

        const overrides = await JiraIssueOverrides.findOneAndUpdate(
            { key },
            { $set: { [`invalidChangelogIds.${changelogId}`]: isInvalid } },
            { upsert: true }
        );

        await JiraIssue.bulkWrite([
            {
                updateOne: {
                    filter: { key },
                    update: {
                        $set: {
                            'extraData.rejections.$[rej].isActive': !isInvalid,
                            syncStatus: JiraIssueSyncStatus.PENDING
                        }
                    },
                    arrayFilters: [{ 'rej.changelogId': changelogId }]
                }
            },
            {
                updateOne: {
                    filter: { key },
                    update: {
                        $set: {
                            'extraData.codeReviews.$[cr].isActive': !isInvalid,
                            syncStatus: JiraIssueSyncStatus.PENDING
                        }
                    },
                    arrayFilters: [{ 'cr.changelogId': changelogId }]
                }
            }
        ]);
        IssueProcessorService.checkToProcess()

        return overrides;
    }

    @AuthServ.authUser(USER_ROLE.ADMIN)
    @PUT({ path: "/:key/sync-status/PENDING" })
    async updateSyncStatusToPending(@Params('key') key: string) {
        const issue = await JiraIssue.findOneAndUpdate(
            { key },
            { $set: { syncStatus: JiraIssueSyncStatus.PENDING } }
        );

        if (!issue) {
            throw new AppLogicError(`Issue with key ${key} not found`, 404);
        }

        IssueProcessorService.checkToProcess()
        return issue;
    }

    @AuthServ.authUser(USER_ROLE.ADMIN)
    @PUT({ path: "/sync-all" })
    async syncAllIssues() {
        await JiraIssue.updateMany({}, { $set: { syncStatus: JiraIssueSyncStatus.PENDING } });
        IssueProcessorService.checkToProcess()
    }
}

export default new JiraIssueRouter();
