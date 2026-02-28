import { GQLField, GQLGlobal, GQLIdenticalMapping, GQLModel, GQLObject, GQLQuery, GQLResolver, GQLU } from "gql-ts";
import hera from "../utils/hera";
import ChangeRequest, { ChangeRequestStatus, ChangeRequestType, IChangeRequest, IChangeRequestData } from "./change-request.mongo";

@GQLObject("change-request")
export class GQLChangeRequest extends GQLModel<IChangeRequest, GQLChangeRequest> {
    @GQLField()
    _id: string;

    @GQLField()
    requestType: ChangeRequestType;

    @GQLField()
    @GQLIdenticalMapping()
    requestData: IChangeRequestData;

    @GQLField()
    description: string;

    @GQLField()
    justification: string;

    @GQLField()
    status: ChangeRequestStatus;

    @GQLField()
    requesterId?: string;

    @GQLField()
    requesterEmail?: string;

    @GQLField()
    processedById?: string;

    @GQLField()
    processedByEmail?: string;

    @GQLField()
    processedAt?: number;

    @GQLField()
    rejectionReason?: string;

    @GQLField()
    createdAt: number;

    @GQLField()
    updatedAt: number;

    static get DefaultSelect() {
        return {
            _id: true,
            requestType: true,
            requestData: true,
            description: true,
            justification: true,
            status: true,
            requesterId: true,
            requesterEmail: true,
            createdAt: true,
            updatedAt: true
        };
    }

    @GQLResolver({ matches: GQLU.byFields([], ['status', 'requesterId', 'requestType', 'q']) })
    static async rootResolve(query: GQLQuery<GQLChangeRequest>) {
        const statuses = query.filter.get('status').batch<string>();
        const requesterIds = query.filter.get('requesterId').batch<string>();
        const requestTypes = query.filter.get('requestType').batch<string>();
        const textQuery = query.filter.get('q').first();

        const mongoQuery = GQLU.notEmpty({
            status: hera.mongoEqOrIn(statuses),
            requesterId: hera.mongoEqOrIn(requesterIds),
            requestType: hera.mongoEqOrIn(requestTypes),
            ...(textQuery ? { $text: { $search: textQuery } } : {})
        });

        return await hera.gqlMongoQueryPagination(
            GQLChangeRequest,
            query,
            ChangeRequest,
            mongoQuery,
            { defaultLimit: 50, maxLimit: 200 }
        );
    }
}

GQLGlobal.add(GQLChangeRequest);
