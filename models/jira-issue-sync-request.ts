import { IMongoDocument, MongoModel } from "../utils/mongo-model";

export enum JiraIssueSyncRequestStatus {
    PENDING = 'PENDING',
    SUCCESS = 'SUCCESS',
    FAILED = 'FAILED',
}

export interface IJiraIssueSyncRequest extends IMongoDocument {
    key: string;
    status: JiraIssueSyncRequestStatus;
    data: Record<string, any>;
}

const JiraIssueSyncRequest = MongoModel.createCollection<IJiraIssueSyncRequest>('jira_issue_sync_request', {
    indexes: [
        { name: 'key', index: { key: 1 }, opts: { unique: true } },
        { name: 'status_id-1', index: { status: 1, _id: -1 } },
    ]
})

export default JiraIssueSyncRequest