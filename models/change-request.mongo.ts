import { ObjectId } from "mongodb";
import { IMongoDocument, MongoModel } from "../utils/mongo-model";

export enum ChangeRequestType {
    PR_POINT_CHANGE = 'PR_POINT_CHANGE',
    LINKED_ISSUE_CHANGE = 'LINKED_ISSUE_CHANGE',
    INVALIDATE_REJECTION = 'INVALIDATE_REJECTION',
}

export enum ChangeRequestStatus {
    PENDING = 'PENDING',
    APPROVED = 'APPROVED',
    REJECTED = 'REJECTED',
    CANCELLED = 'CANCELLED',
}

export interface IChangeRequestData {
    targetId: ObjectId;

    newPoints?: number;
    newLinkedIssueKey?: string;
    changelogId?: string;
}

export interface IChangeRequest extends IMongoDocument {
    requestType: ChangeRequestType;
    requestData: IChangeRequestData;

    description: string;
    status: ChangeRequestStatus;

    requesterId: ObjectId; // User._id who requested
    requesterEmail: string; // For quick display

    processedById?: ObjectId; // Admin who approved/rejected
    processedByEmail?: string;
    processedAt?: number;
    rejectionReason?: string;

    createdAt: number;
    updatedAt: number;
}

const ChangeRequest = MongoModel.createCollection<IChangeRequest>('change_request', {
    indexes: [
        {
            name: 'status-createdAt',
            index: { status: 1, createdAt: -1 }
        },
        {
            name: 'requesterId',
            index: { requesterId: 1 }
        },
        {
            name: 'requestType',
            index: { requestType: 1 }
        },
        {
            name: 'targetId-status',
            index: {
                'requestData.targetId': 1,
                status: 1
            }
        },
        {
            name: 'createdAt',
            index: { createdAt: -1 }
        }
    ]
});

export default ChangeRequest;
