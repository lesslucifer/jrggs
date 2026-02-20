import { Body, ExpressRouter, GET, POST, PUT, Params, Query } from "express-router-ts";
import { USER_ROLE } from "../glob/cf";
import { AuthServ } from "../serv/auth";
import { ValidBody, DocGQLResponse, Caller } from "../utils/decors";
import { GQLFieldFilter, GQLGlobal, GQLU } from "gql-ts";
import { GQLChangeRequest } from "../models/change-request.gql";
import { IUser } from "../models/user.mongo";
import ChangeRequest, { ChangeRequestStatus, ChangeRequestType, IChangeRequestData } from "../models/change-request.mongo";
import BitbucketPR, { BitbucketPRSyncStatus } from "../models/bitbucket-pr.mongo";
import { AppLogicError } from "../utils/hera";
import { BitbucketPRProcessorService } from "../serv/jrggs/bitbucket-pr-process";
import { ObjectId } from "mongodb";
import HC from "../glob/hc";

class ChangeRequestRouter extends ExpressRouter {
    document = {
        'tags': ['Change Requests']
    };

    @AuthServ.authUser(USER_ROLE.USER)
    @GET({ path: "/" })
    @DocGQLResponse(GQLChangeRequest)
    async getRequests(@Query() query: Record<string, string>) {
        const q = GQLGlobal.queryFromHttpQuery(query, GQLChangeRequest);
        GQLU.whiteListFilter(q, 'status', 'requestType');

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
        '@description': 'string',
        '++': false
    })
    @POST({ path: "/pr-point-change" })
    async createPRPointChangeRequest(
        @Body() body: {
            prId: string;
            newPoints: number;
            description: string;
        },
        @Caller() caller: IUser
    ) {
        const pr = await BitbucketPR.findOne({ _id: new ObjectId(body.prId) });
        if (!pr) {
            throw new AppLogicError(`PR not found`, 404);
        }

        const oldPoints = pr.overrides?.points;

        const existingPendingRequest = await ChangeRequest.findOne({
            requestType: ChangeRequestType.PR_POINT_CHANGE,
            'requestData.targetId': pr._id,
            status: ChangeRequestStatus.PENDING,
            requesterId: caller._id
        });

        if (existingPendingRequest) {
            throw new AppLogicError('You already have a pending request for this PR', 400);
        }

        const requestData: IChangeRequestData = {
            targetId: pr._id,
            oldPoints,
            newPoints: body.newPoints
        };

        const now = Date.now();
        const result = await ChangeRequest.insertOne({
            requestType: ChangeRequestType.PR_POINT_CHANGE,
            requestData,
            description: body.description,
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

        if (request.requestType === ChangeRequestType.PR_POINT_CHANGE) {
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
        }
        BitbucketPRProcessorService.checkToProcess();

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

        if (request.requestType === ChangeRequestType.PR_POINT_CHANGE) {
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
            const { targetId, oldPoints, newPoints } = request.requestData;

            const pr = await BitbucketPR.findOne({ _id: targetId });
            if (!pr) {
                throw new AppLogicError('PR not found. It may have been deleted.', 404);
            }

            const currentPoints = pr.overrides?.points;
            if (currentPoints !== oldPoints) {
                throw new AppLogicError(`Conflict detected: PR points have changed from ${oldPoints} to ${currentPoints} since request was created. Please cancel and create a new request.`, 409);
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
