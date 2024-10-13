import { MongoModel } from '../utils/mongo-model';

export interface IJiraIssueMetadata {
    key: string;
    summaryWithSprints: string;
    sprints: string;
    severity: string;
}

const JiraIssueMetadata = MongoModel.createCollection<IJiraIssueMetadata>('issue_metadata', {
    indexes: [
        { name: 'key', index: { key: 1 }, opts: { unique: true } },
        { name: 'severity', index: { severity: 1 } },
    ]
});

export default JiraIssueMetadata;
