import { Body, ExpressRouter, GET, PUT, Params, Query } from "express-router-ts";
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

    @AuthServ.authUser(USER_ROLE.USER)
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

    @AuthServ.authUser(USER_ROLE.USER)
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

    @AuthServ.authUser(USER_ROLE.USER)
    @GET({ path: "/:key/history" })
    async getIssueHistory(@Params('key') key: string) {
        const issue = await JiraIssue.findOne({ key });
        const data = new JiraIssueData(issue.data)
        return {
            key: issue.key,
            title: data.summary,
            type: data.type,
            severity: data.severity,
            history: issue.history,
            changelog: issue.changelog
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

        await JiraIssue.updateOne({ key }, { $set: { 'extraData.storyPoints': _.sortBy(Object.entries(body.storyPoints).map(([uid, sp]) => ({ userId: uid, storyPoints: sp })), 'userId'), syncStatus: JiraIssueSyncStatus.PENDING } });
        IssueProcessorService.checkToProcess()

        return overrides;
    }

    @AuthServ.authUser(USER_ROLE.ADMIN)
    @PUT({ path: "/:key/overrides/excluded/:isExcluded" })
    async updateExcludedOverride(@Params('key') key: string, @Params('isExcluded') sIsExcluded: string) {
        const isExcluded = GQLU.toBoolean(sIsExcluded)
        const issue = await JiraIssue.findOne({ key }, { projection: { _id: 1, key: 1, data: 1 } });
        if (!issue) {
            throw new AppLogicError(`Issue with key ${key} not found`, 404);
        }

        const overrides = await JiraIssueOverrides.findOneAndUpdate(
            { key },
            { $set: { excluded: isExcluded } },
            { upsert: true }
        );

        await JiraIssue.updateOne({ key }, { $set: { 'extraData.excluded': isExcluded, syncStatus: JiraIssueSyncStatus.PENDING } });
        if (issue.data?.fields?.parent?.key) {
            await JiraIssue.updateOne({ key: issue.data.fields.parent.key }, { $set: { syncStatus: JiraIssueSyncStatus.PENDING } });
        }

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
    @PUT({ path: "/:key/overrides/invalidDefectsIds/:defectId/:invalid" })
    async updateDefectInvalidation(@Params('key') key: string, @Params('defectId') defectId: string, @Params('invalid') sInvalid: string) {
        const isInvalid = GQLU.toBoolean(sInvalid)
        const issue = await JiraIssue.findOne({ key }, { projection: { _id: 1, key: 1, extraData: 1 } });
        if (!issue) {
            throw new AppLogicError(`Issue with key ${key} not found`, 404);
        }

        const overrides = await JiraIssueOverrides.findOneAndUpdate(
            { key },
            { $set: { [`invalidDefectsIds.${defectId}`]: isInvalid } },
            { upsert: true }
        );

        await JiraIssue.updateOne({ key }, {
            $set: {
                'extraData.defects.$[def].isActive': !isInvalid,
                syncStatus: JiraIssueSyncStatus.PENDING
            }
        }, {
            arrayFilters: [{ 'def.issueKey': defectId }]
        });
        IssueProcessorService.checkToProcess()

        return overrides;
    }

    @AuthServ.authUser(USER_ROLE.USER)
    @GET({ path: "/sprint/:sprintId" })
    async getIssuesBySprint(@Params('sprintId') sprintId: string) {
        const sprintIdNum = parseInt(sprintId);

        const issues = await JiraIssue.find({
            sprintIds: sprintIdNum,
            'data.fields.issuetype.name': { $ne: 'Sub-task' },
            'extraData.excluded': { $ne: true }
        }).toArray();

        return issues.map(issue => {
            const data = new JiraIssueData(issue.data);
            return {
                key: issue.key,
                title: data.summary,
                type: data.type,
                severity: data.severity,
                storyPoints: data.storyPoint,
                estSP: data.estSP,
                extraData: issue.extraData ?? {},
                metrics: issue.metrics,
                completedAt: issue.completedAt,
                completedSprint: issue.completedSprint,
                status: data.status,
                sprintIds: issue.sprintIds,
                syncStatus: issue.syncStatus,
            };
        });
    }

    @AuthServ.authUser(USER_ROLE.ADMIN)
    @PUT({ path: "/:key/sync-status/PENDING" })
    async updateSyncStatusToPending(@Params('key') key: string) {
        const issue = await JiraIssue.findOneAndUpdate(
            { key },
            { $set: { syncStatus: JiraIssueSyncStatus.PENDING, syncParams: { refreshHistory: true } } }
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
        await JiraIssue.updateMany({}, { $set: { syncStatus: JiraIssueSyncStatus.PENDING, syncParams: { refreshHistory: true } } });
        IssueProcessorService.checkToProcess()
    }
}

export default new JiraIssueRouter();
