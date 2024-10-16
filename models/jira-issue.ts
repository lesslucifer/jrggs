import { IMongoDocument, MongoModel } from "../utils/mongo-model";

export enum JiraIssueSyncStatus {
    PENDING = 'PENDING',
    PROCESSING = 'PROCESSING',
    SUCCESS = 'SUCCESS',
    FAILED = 'FAILED',
}

export interface IJiraIssueChangelogRecord {
    id: string;
    author: {
        displayName: string;
        avatarUrl: string;
    };
    created: string;
    items?: {
        field?: string;
        from?: string;
        fromString?: string;
        to?: string;
        toString?: string;
    }[];
}

export interface IJiraIssueMetrics {
    storyPoints: {
        [uid: string]: number;
    },
    nRejections: {
        [uid: string]: number;
    };
    nDefects: {
        [uid: string]: number;
    };
}

export interface IJiraIssueComment {
    author: {
        accountId: string;
        displayName: string;
        avatarUrl: string;
    };
    created: string;
    body: string;
}

export interface IJiraIssue extends IMongoDocument {
    key: string;
    lastSyncAt: number;
    
    syncStatus: JiraIssueSyncStatus;
    data: Record<string, any>;
    
    changelog: IJiraIssueChangelogRecord[];
    comments: IJiraIssueComment[];

    completedAt?: number;
    metrics: IJiraIssueMetrics;

    overrides: {
        invalidRejections: {
            uid: string;
            created: number;
            text: string;
        }[];
    };
}

const JiraIssue = MongoModel.createCollection<IJiraIssue>('jira_issue', {
    indexes: [
        { name: 'key', index: { key: 1 }, opts: { unique: true } },
        { name: 'syncStatus-1', index: { syncStatus: 1, _id: -1 } },
        { name: 'completedAt-1', index: { completedAt: -1 } },
        { name: 'fields.parent.key-hashed', index: { 'fields.parent.key': 'hashed' } },
    ]
})

export default JiraIssue