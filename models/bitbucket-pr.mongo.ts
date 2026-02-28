import { IMongoDocument, MongoModel } from "../utils/mongo-model";
import { IChangeRequest } from "./change-request.mongo";

export enum BitbucketPRSyncStatus {
    PENDING = 'PENDING',
    PROCESSING = 'PROCESSING',
    SUCCESS = 'SUCCESS',
    FAILED = 'FAILED',
}

export interface IBitbucketUser {
    uuid?: string;
    display_name?: string;
    nickname?: string;
    account_id?: string;
    links?: {
        avatar?: {
            href?: string;
        };
    };
}

export interface IBitbucketPRActivity {
    update?: {
        date?: string;
        author?: IBitbucketUser;
        state?: string;
        reason?: string;
    };
    approval?: {
        date?: string;
        user?: IBitbucketUser;
    };
    comment?: {
        id?: number;
        created_on?: string;
        user?: IBitbucketUser;
        content?: {
            raw?: string;
            html?: string;
        };
        inline?: {
            to?: number;
            from?: number;
            path?: string;
        };
    };
}

export interface IBitbucketPRCommit {
    hash: string;
    message?: string;
    date?: string;
    author?: {
        raw?: string;
        user?: IBitbucketUser;
    };
}

export type IBitbucketPRBranchInfo = {
    branch: {
        name: string;
    };
    commit: {
        hash: string;
        links: {
            self: { href: string };
            html: { href: string };
        };
        type: string;
    };
    repository: {
        type: string;
        full_name: string;
        links: {
            self: { href: string };
            html: { href: string };
            avatar: { href: string };
        };
        name: string;
        uuid: string;
    };
}

export interface IBitbucketPRData {
    comment_count: number;
    task_count: number;
    type: string;
    id: number;
    title: string;
    description: string;
    state: string;
    draft: boolean;
    author: IBitbucketUser;
    reason: string;
    created_on: string;
    updated_on: string;
    destination: IBitbucketPRBranchInfo;
    source: IBitbucketPRBranchInfo;
    links: Record<string, { href: string }>;
    summary: {
        type: string;
        raw: string;
        markup: string;
        html: string;
    };
}

export interface IBitbucketPRComputedData {
    totalComments: number;
    totalApprovals: number;
    totalDeclines: number;
    reviewersApproved: string[];
    reviewersRequestedChanges: string[];
    firstReviewTime?: number;
    reviewCycleTime?: number;
    reviewerCommentCounts?: Record<string, number>;
}

export interface IBitbucketPR extends IMongoDocument {
    prId: string;
    workspace: string;
    repoSlug: string;

    data: IBitbucketPRData;

    activity: IBitbucketPRActivity[];

    commits: IBitbucketPRCommit[];

    status?: string;
    computedData?: IBitbucketPRComputedData;

    overrides?: {
        picAccountId?: string;
        points?: number;
        computedData?: Partial<IBitbucketPRComputedData>;
    };

    linkedJiraIssues?: string[];
    activeLinkedIssueKey?: string;

    pendingRequests?: IChangeRequest[];
    processedCommentIds?: number[];

    lastSyncAt: number;
    syncStatus: BitbucketPRSyncStatus;
    syncParams?: {
        skipActivity?: boolean;
        skipCommits?: boolean;
    };
}

const BitbucketPR = MongoModel.createCollection<IBitbucketPR>('bitbucket_pr', {
    indexes: [
        {
            name: 'prId-workspace-repo',
            index: { prId: 1, workspace: 1, repoSlug: 1 },
            opts: { unique: true }
        },
        {
            name: 'syncStatus-1',
            index: { syncStatus: 1, _id: -1 }
        },
        {
            name: 'data.state',
            index: { 'data.state': 1 }
        },
        {
            name: 'data.author.uuid',
            index: { 'data.author.uuid': 1 }
        },
        {
            name: 'data.created_on',
            index: { 'data.created_on': -1 }
        },
        {
            name: 'data.updated_on',
            index: { 'data.updated_on': -1 }
        },
        {
            name: 'linkedJiraIssues',
            index: { linkedJiraIssues: 1 }
        },
        {
            name: 'activeLinkedIssueKey',
            index: { activeLinkedIssueKey: 1 }
        },
        {
            name: 'text',
            index: {
                prId: 'text',
                linkedJiraIssues: 'text',
                'data.title': 'text'
            },
            opts: { default_language: 'none' }
        }
    ]
});

export default BitbucketPR;
