import { Body, ExpressRouter, GET, POST, PUT, Params, Query } from "express-router-ts";
import { USER_ROLE } from "../glob/cf";
import { AuthServ } from "../serv/auth";
import { ValidBody, DocGQLResponse, Caller } from "../utils/decors";
import { GQLFieldFilter, GQLGlobal, GQLU } from "gql-ts";
import { GQLChangeRequest } from "../models/change-request.gql";
import { IUser } from "../models/user.mongo";
import ChangeRequest, { ChangeRequestStatus, ChangeRequestType, IChangeRequestData } from "../models/change-request.mongo";
import BitbucketPR, { BitbucketPRSyncStatus } from "../models/bitbucket-pr.mongo";
import JiraIssue, { JiraIssueSyncStatus } from "../models/jira-issue.mongo";
import JiraIssueOverrides from "../models/jira-issue-overrides.mongo";
import { AppLogicError } from "../utils/hera";
import { BitbucketPRProcessorService } from "../serv/jrggs/bitbucket-pr-process";
import { IssueProcessorService } from "../serv/jrggs/issue-process";
import { ObjectId } from "mongodb";

class ChangeRequestRouter extends ExpressRouter {
    document = {
        'tags': ['Change Requests']
    };

    @AuthServ.authUser(USER_ROLE.USER)
    @GET({ path: "/" })
    @DocGQLResponse(GQLChangeRequest)
    async getRequests(@Query() query: Record<string, string>, @Caller() caller: IUser) {
        const q = GQLGlobal.queryFromHttpQuery(query, GQLChangeRequest);
        GQLU.whiteListFilter(q, 'status', 'requestType', 'q');

        if (!caller.roles.includes(USER_ROLE.ADMIN)) {
            q.filter.addFieldFilter('requesterId', caller._id)
        }

        return await q.resolve();
    }

    @AuthServ.authUser(USER_ROLE.USER)
    @GET({ path: "/:requestId" })
    @DocGQLResponse(GQLChangeRequest)
    async getRequestById(
        @Params('requestId') requestId: string,
        @Query() query: Record<string, string>,
    ) {
        const q = GQLGlobal.queryFromHttpQuery(query, GQLChangeRequest);
        GQLU.whiteListFilter(q);
        q.filter.add(new GQLFieldFilter('_id', requestId));
        q.options.one = true;

        return await q.resolve();
    }

    @AuthServ.authUser(USER_ROLE.USER)
    @ValidBody({
        '@prId': 'string',
        '@newPoints': 'number|>=0',
        '@justification': 'string',
        '++': false
    })
    @POST({ path: "/pr-point-change" })
    async createPRPointChangeRequest(
        @Body() body: {
            prId: string;
            newPoints: number;
            justification: string;
        },
        @Caller() caller: IUser
    ) {
        const pr = await BitbucketPR.findOne({ _id: new ObjectId(body.prId) });
        if (!pr) {
            throw new AppLogicError(`PR not found`, 404);
        }

        const existingPendingRequest = await ChangeRequest.findOne({
            requestType: ChangeRequestType.PR_POINT_CHANGE,
            'requestData.targetId': pr._id,
            status: ChangeRequestStatus.PENDING
        });

        if (existingPendingRequest) {
            throw new AppLogicError('Tge PR already have a pending request', 400);
        }

        const oldPoints = pr.overrides?.points ?? 0;
        const linkedIssues = pr.linkedJiraIssues?.join(', ') || 'none';
        const description = `Change points for PR #${pr.prId} (linked to ${linkedIssues}) from ${oldPoints} to ${body.newPoints}`;

        const requestData: IChangeRequestData = {
            targetId: pr._id,
            newPoints: body.newPoints
        };

        const now = Date.now();
        const result = await ChangeRequest.insertOne({
            requestType: ChangeRequestType.PR_POINT_CHANGE,
            requestData,
            description,
            justification: body.justification,
            status: ChangeRequestStatus.PENDING,
            requesterId: caller._id,
            requesterEmail: caller.email,
            createdAt: now,
            updatedAt: now
        });

        const insertedRequest = await ChangeRequest.findOne({ _id: result.insertedId });
        if (!insertedRequest) {
            throw new AppLogicError('Failed to create request', 500);
        }

        await BitbucketPR.updateOne(
            { _id: pr._id },
            { 
              $set: {
                syncStatus: BitbucketPRSyncStatus.PENDING,
                syncParams: {
                    skipActivity: true,
                    skipCommits: true
                }
              },
              $push: { pendingRequests: insertedRequest }
            }
        );
        BitbucketPRProcessorService.checkToProcess();

        return insertedRequest;
    }

    @AuthServ.authUser(USER_ROLE.USER)
    @ValidBody({
        '@prId': 'string',
        '@newLinkedIssueKey': 'string',
        '@justification': 'string',
        '++': false
    })
    @POST({ path: "/linked-issue-change" })
    async createLinkedIssueChangeRequest(
        @Body() body: {
            prId: string;
            newLinkedIssueKey: string;
            justification: string;
        },
        @Caller() caller: IUser
    ) {
        const pr = await BitbucketPR.findOne({ _id: new ObjectId(body.prId) });
        if (!pr) {
            throw new AppLogicError(`PR not found`, 404);
        }

        if (body.newLinkedIssueKey) {
            const issue = await JiraIssue.findOne({ key: body.newLinkedIssueKey }, { projection: { _id: 1 } });
            if (!issue) {
                throw new AppLogicError(`JIRA issue ${body.newLinkedIssueKey} not found`, 404);
            }
        }

        const existingPendingRequest = await ChangeRequest.findOne({
            requestType: ChangeRequestType.LINKED_ISSUE_CHANGE,
            'requestData.targetId': pr._id,
            status: ChangeRequestStatus.PENDING
        });

        if (existingPendingRequest) {
            throw new AppLogicError('There is already a pending request for this PR', 400);
        }

        const oldLinkedIssueKey = pr.activeLinkedIssueKey || 'none';
        const description = `Change linked issue for PR #${pr.prId} from ${oldLinkedIssueKey} to ${body.newLinkedIssueKey}`;

        const requestData: IChangeRequestData = {
            targetId: pr._id,
            newLinkedIssueKey: body.newLinkedIssueKey
        };

        const now = Date.now();
        const result = await ChangeRequest.insertOne({
            requestType: ChangeRequestType.LINKED_ISSUE_CHANGE,
            requestData,
            description,
            justification: body.justification,
            status: ChangeRequestStatus.PENDING,
            requesterId: caller._id,
            requesterEmail: caller.email,
            createdAt: now,
            updatedAt: now
        });

        const insertedRequest = await ChangeRequest.findOne({ _id: result.insertedId });
        if (!insertedRequest) {
            throw new AppLogicError('Failed to create request', 500);
        }

        await BitbucketPR.updateOne(
            { _id: pr._id },
            {
              $set: {
                syncStatus: BitbucketPRSyncStatus.PENDING,
                syncParams: {
                    skipActivity: true,
                    skipCommits: true
                }
              },
              $push: { pendingRequests: insertedRequest }
            }
        );
        BitbucketPRProcessorService.checkToProcess();

        return insertedRequest;
    }

    @AuthServ.authUser(USER_ROLE.USER)
    @ValidBody({
        '@issueId': 'string',
        '@changelogId': 'string',
        '@justification': 'string',
        '++': false
    })
    @POST({ path: "/invalidate-rejection-change" })
    async createInvalidateRejectionRequest(
        @Body() body: {
            issueId: string;
            changelogId: string;
            justification: string;
        },
        @Caller() caller: IUser
    ) {
        const issue = await JiraIssue.findOne({ _id: new ObjectId(body.issueId) });
        if (!issue) {
            throw new AppLogicError(`JIRA issue ${body.issueId} not found`, 404);
        }

        const changelog = issue.changelog?.find(log => log.id === body.changelogId);
        if (!changelog) {
            throw new AppLogicError(`Changelog ${body.changelogId} not found in issue ${issue.key}`, 404);
        }

        const hasRejection = issue.extraData?.rejections?.some(rej => rej.changelogId === body.changelogId);
        if (!hasRejection) {
            throw new AppLogicError(`No rejection found for changelog ${body.changelogId}`, 400);
        }

        const existingPendingRequest = await ChangeRequest.findOne({
            requestType: ChangeRequestType.INVALIDATE_REJECTION,
            'requestData.targetId': issue._id,
            'requestData.changelogId': body.changelogId,
            status: ChangeRequestStatus.PENDING
        });

        if (existingPendingRequest) {
            throw new AppLogicError('There is already a pending request for this rejection', 400);
        }

        const description = `Invalidate rejection for issue ${issue.key} (changelog ${body.changelogId})`;

        const requestData: IChangeRequestData = {
            targetId: issue._id,
            changelogId: body.changelogId
        };

        const now = Date.now();
        const result = await ChangeRequest.insertOne({
            requestType: ChangeRequestType.INVALIDATE_REJECTION,
            requestData,
            description,
            justification: body.justification,
            status: ChangeRequestStatus.PENDING,
            requesterId: caller._id,
            requesterEmail: caller.email,
            createdAt: now,
            updatedAt: now
        });

        const insertedRequest = await ChangeRequest.findOne({ _id: result.insertedId });
        if (!insertedRequest) {
            throw new AppLogicError('Failed to create request', 500);
        }

        await JiraIssue.updateOne(
            { _id: issue._id },
            {
              $set: {
                syncStatus: JiraIssueSyncStatus.PENDING,
                syncParams: {
                    skipHistory: true,
                    skipChangeLog: true,
                    skipDevInCharge: true
                }
              },
              $push: { pendingRequests: insertedRequest }
            }
        );
        IssueProcessorService.checkToProcess()

        return insertedRequest;
    }

    @AuthServ.authUser(USER_ROLE.USER)
    @PUT({ path: "/:requestId/cancel" })
    async cancelRequest(@Params('requestId') requestId: string, @Caller() caller: IUser) {
        const request = await ChangeRequest.findOne({ _id: new ObjectId(requestId) });
        if (!request) {
            throw new AppLogicError('Request not found', 404);
        }

        if (request.status !== ChangeRequestStatus.PENDING) {
            throw new AppLogicError('Can only cancel pending requests', 400);
        }

        if (!request.requesterId?.equals(caller._id)) {
            throw new AppLogicError('You can only cancel your own requests', 403);
        }

        const result = await ChangeRequest.updateOne({ _id: request._id }, {
            $set: {
                status: ChangeRequestStatus.CANCELLED,
                updatedAt: Date.now()
            }
        });

        if (request.requestType === ChangeRequestType.PR_POINT_CHANGE || request.requestType === ChangeRequestType.LINKED_ISSUE_CHANGE) {
            await BitbucketPR.updateOne({ _id: request.requestData.targetId }, {
              $set: {
                syncStatus: BitbucketPRSyncStatus.PENDING,
                syncParams: {
                    skipActivity: true,
                    skipCommits: true
                }
              },
              $pull: { pendingRequests: { _id: request._id } }
            });
            BitbucketPRProcessorService.checkToProcess();
        }

        if (request.requestType === ChangeRequestType.INVALIDATE_REJECTION) {
            await JiraIssue.updateOne({ _id: request.requestData.targetId }, {
              $set: {
                syncStatus: JiraIssueSyncStatus.PENDING,
                syncParams: {
                    skipHistory: true,
                    skipChangeLog: true,
                    skipDevInCharge: true
                }
              },
              $pull: { pendingRequests: { _id: request._id } }
            });
        }

        return result.modifiedCount;
    }

    @AuthServ.authUser(USER_ROLE.ADMIN)
    @ValidBody({
        '@rejectionReason': 'string',
        '++': false
    })
    @PUT({ path: "/:requestId/reject" })
    async rejectRequest(
        @Params('requestId') requestId: string,
        @Body() body: { rejectionReason: string },
        @Caller() caller: IUser
    ) {
        const request = await ChangeRequest.findOne({ _id: new ObjectId(requestId) });
        if (!request) {
            throw new AppLogicError('Request not found', 404);
        }

        if (request.status !== ChangeRequestStatus.PENDING) {
            throw new AppLogicError('Can only reject pending requests', 400);
        }

        const now = Date.now();
        const result = await ChangeRequest.updateOne({ _id: request._id }, {
            $set: {
                status: ChangeRequestStatus.REJECTED,
                rejectionReason: body.rejectionReason,
                processedById: caller._id,
                processedByEmail: caller.email,
                processedAt: now,
                updatedAt: now
            }
        });

        if (request.requestType === ChangeRequestType.PR_POINT_CHANGE || request.requestType === ChangeRequestType.LINKED_ISSUE_CHANGE) {
          await BitbucketPR.updateOne({ _id: request.requestData.targetId }, {
            $set: {
              syncStatus: BitbucketPRSyncStatus.PENDING,
              syncParams: {
                  skipActivity: true,
                  skipCommits: true
              }
            },
            $pull: { pendingRequests: { _id: request._id } }
          });
          BitbucketPRProcessorService.checkToProcess();
        }

        if (request.requestType === ChangeRequestType.INVALIDATE_REJECTION) {
            await JiraIssue.updateOne({ _id: request.requestData.targetId }, {
              $set: {
                syncStatus: JiraIssueSyncStatus.PENDING,
                syncParams: {
                    skipHistory: true,
                    skipChangeLog: true,
                    skipDevInCharge: true
                }
              },
              $pull: { pendingRequests: { _id: request._id } }
            });
        }

        return result.modifiedCount;
    }

    @AuthServ.authUser(USER_ROLE.ADMIN)
    @PUT({ path: "/:requestId/approve" })
    async approveRequest(
        @Params('requestId') requestId: string,
        @Caller() caller: IUser
    ) {
        const request = await ChangeRequest.findOne({ _id: new ObjectId(requestId) });
        if (!request) {
            throw new AppLogicError('Request not found', 404);
        }

        if (request.status !== ChangeRequestStatus.PENDING) {
            throw new AppLogicError('Can only approve pending requests', 400);
        }

        if (request.requestType === ChangeRequestType.PR_POINT_CHANGE) {
            const { targetId, newPoints } = request.requestData;

            const pr = await BitbucketPR.findOne({ _id: targetId });
            if (!pr) {
                throw new AppLogicError('PR not found. It may have been deleted.', 404);
            }

            await BitbucketPR.updateOne(
                { _id: targetId },
                {
                    $set: {
                        'overrides.points': newPoints,
                        syncStatus: BitbucketPRSyncStatus.PENDING,
                        syncParams: {
                            skipActivity: true,
                            skipCommits: true
                        }
                    },
                    $pull: { pendingRequests: { _id: request._id } }
                }
            );

            BitbucketPRProcessorService.checkToProcess();
        }

        if (request.requestType === ChangeRequestType.LINKED_ISSUE_CHANGE) {
            const { targetId, newLinkedIssueKey } = request.requestData;

            const pr = await BitbucketPR.findOne({ _id: targetId });
            if (!pr) {
                throw new AppLogicError('PR not found. It may have been deleted.', 404);
            }

            await BitbucketPR.updateOne({ _id: pr._id }, {
                $set: {
                    activeLinkedIssueKey: newLinkedIssueKey,
                    syncStatus: BitbucketPRSyncStatus.PENDING
                },
                $pull: { pendingRequests: { _id: request._id } },
                ...(newLinkedIssueKey && !pr.linkedJiraIssues?.includes(newLinkedIssueKey) ? {
                    $push: { linkedJiraIssues: newLinkedIssueKey }
                } : {})
            });
  
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
        }

        if (request.requestType === ChangeRequestType.INVALIDATE_REJECTION) {
            const { targetId, changelogId } = request.requestData;

            const issue = await JiraIssue.findOne({ _id: targetId });
            if (!issue) {
                throw new AppLogicError('JIRA issue not found. It may have been deleted.', 404);
            }

            await JiraIssueOverrides.updateOne({ key: issue.key }, {
                $set: {
                    [`invalidChangelogIds.${changelogId}`]: true
                }
            }, {
                upsert: true
            });

            await JiraIssue.bulkWrite([
                {
                    updateOne: {
                        filter: { _id: issue._id },
                        update: {
                            $set: {
                                'extraData.rejections.$[elem].isActive': false
                            }
                        },
                        arrayFilters: [{ 'elem.changelogId': changelogId }]
                    }
                },
                {
                    updateOne: {
                        filter: { _id: issue._id },
                        update: {
                            $set: {
                                'extraData.codeReviews.$[elem].isActive': false
                            }
                        },
                        arrayFilters: [{ 'elem.changelogId': changelogId }]
                    }
                },
                {
                    updateOne: {
                        filter: { _id: issue._id },
                        update: {
                            $set: {
                                syncStatus: JiraIssueSyncStatus.PENDING,
                                syncParams: {
                                    skipHistory: true,
                                    skipChangeLog: true,
                                    skipDevInCharge: true
                                }
                            },
                            $pull: { pendingRequests: { _id: request._id } }
                        }
                    }
                }
            ]);

            IssueProcessorService.checkToProcess();
        }

        const now = Date.now();
        const result = await ChangeRequest.updateOne(
            { _id: request._id },
            {
                $set: {
                    status: ChangeRequestStatus.APPROVED,
                    processedById: caller._id,
                    processedByEmail: caller.email,
                    processedAt: now,
                    updatedAt: now
                }
            }
        );
        
        return result.modifiedCount
    }
}

export default new ChangeRequestRouter();
