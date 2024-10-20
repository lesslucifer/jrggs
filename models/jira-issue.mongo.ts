import { IMongoDocument, MongoModel } from "../utils/mongo-model";

export enum JiraIssueSyncStatus {
    PENDING = 'PENDING',
    PROCESSING = 'PROCESSING',
    SUCCESS = 'SUCCESS',
    FAILED = 'FAILED',
}

export interface IJiraUserInfo {
    accountId?: string;
    displayName?: string;
    avatarUrls?: Record<string, string>;
}

export interface IJiraIssueSprint {
    id: number;
    name: string;
}

export interface IJiraIssueChangelogRecord {
    id: string;
    author: IJiraUserInfo;
    created: string;
    items?: {
        field?: string;
        from?: string;
        fromString?: string;
        to?: string;
        toString?: string;
    }[];
}

export type IJiraIssueMetrics = {
    storyPoints: number;
    nRejections: number;
    defects: string[];
    nCodeReviews: number;
}

export type IJiraIssueUserMetrics = Record<string, IJiraIssueMetrics>

export interface IJiraIssueComment {
    author: IJiraUserInfo;
    created: string;
    body: string;
}

export interface IJiraIssueOverrides {
    invalidRejections: {
        uid: string;
        created: number;
        text: string;
    }[];
    storyPoints: {
        [uid: string]: number;
    }
}
export interface IJiraIssue extends IMongoDocument {
    key: string;
    lastSyncAt: number;
    
    syncStatus: JiraIssueSyncStatus;
    data: Record<string, any>;
    
    changelog: IJiraIssueChangelogRecord[];
    comments: IJiraIssueComment[];

    completedAt?: number;
    completedSprint?: IJiraIssueSprint;
    metrics: IJiraIssueUserMetrics;

    overrides: IJiraIssueOverrides;
    
    seqSyncAt?: number;
}

const JiraIssue = MongoModel.createCollection<IJiraIssue>('jira_issue', {
    indexes: [
        { name: 'key', index: { key: 1 }, opts: { unique: true } },
        { name: 'syncStatus-1', index: { syncStatus: 1, _id: -1 } },
        { name: 'completedAt-1', index: { completedAt: -1 } },
        { name: 'data.fields.parent.key-hashed', index: { 'data.fields.parent.key': 'hashed' } },
        { name: 'completedSprint.id-hashed', index: { 'completedSprint.id': 'hashed' } },
        { name: 'seqSyncAt-1', index: { seqSyncAt: -1, _id: 1 } },
    ]
})

export default JiraIssue