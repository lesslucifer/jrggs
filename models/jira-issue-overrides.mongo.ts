import { MongoModel } from "../utils/mongo-model";

export interface IJiraIssueOverrides {
    key: string;
    storyPoints: {
        [uid: string]: number;
    }
}

const JiraIssueOverrides = MongoModel.createCollection<IJiraIssueOverrides>('jira_issue_overrides', {
    indexes: [
        { name: 'key', index: { key: 1 }, opts: { unique: true } }
    ]
})

export default JiraIssueOverrides