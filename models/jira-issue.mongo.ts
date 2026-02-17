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

export interface IJiraRejection {
    changelogId: string;
    userId: string;
    time: number;
    rejectedBy: string;
    isActive: boolean;
}

export interface IJiraCodeReview {
    changelogId: string;
    userId: string;
    time: number;
    isActive: boolean;
}

export type IJiraIssueMetrics = {
    storyPoints: number;
    nRejections: number;
    defects: number;
    nCodeReviews: number;
    nPRs: number;
    prPoints: number;
}

export type IJiraIssueUserMetrics = Record<string, IJiraIssueMetrics>

export interface IJiraIssueComment {
    id: string;
    author: IJiraUserInfo;
    created: string;
    body: string;
}

export interface IJiraIssueHistoryRecord {
    field?: string;
    assigneeId: string;
    assigneeName?: string;
    status: string;
    storyPoints?: number;
    estSP?: number;
    sprintId?: number;
    sprintName?: string;
    time: number;
}

export interface IJiraIssue extends IMongoDocument {
    key: string;

    data: Record<string, any>;
    changelog: IJiraIssueChangelogRecord[];

    history?: IJiraIssueHistoryRecord[];
    current?: IJiraIssueHistoryRecord;

    completedAt?: number;
    completedSprint?: IJiraIssueSprint;
    metrics: IJiraIssueUserMetrics;
    sprintIds?: number[];
    inChargeDevs?: string[];

    extraPoints?: {
        userId: string;
        extraPoints: number;
    }[];

    extraData?: {
        storyPoints?: {
            userId: string;
            storyPoints: number;
        }[];
        defects?: {
            userId: string;
            issueKey: string;
            isActive: boolean;
        }[];
        excluded?: boolean;
        rejections?: IJiraRejection[];
        codeReviews?: IJiraCodeReview[];
        estSP?: number;
    }

    lastSyncAt: number;
    syncStatus: JiraIssueSyncStatus;
    syncParams?: {
        skipChangeLog?: boolean;
        skipDevInCharge?: boolean;
        skipHistory: boolean;
    };
}

const JiraIssue = MongoModel.createCollection<IJiraIssue>('jira_issue', {
    indexes: [
        { name: 'key', index: { key: 1 }, opts: { unique: true } },
        { name: 'syncStatus-1', index: { syncStatus: 1, _id: -1 } },
        { name: 'completedAt-1', index: { completedAt: -1 } },
        { name: 'data.fields.parent.key-hashed', index: { 'data.fields.parent.key': 'hashed' } },
        { name: 'completedSprint.id-hashed', index: { 'completedSprint.id': 'hashed' } },
        { name: 'sprintIds', index: { sprintIds: 1 } }
    ]
})

export default JiraIssue