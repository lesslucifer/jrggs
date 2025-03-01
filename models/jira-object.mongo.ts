import { IMongoDocument, MongoModel } from "../utils/mongo-model";

export interface IJiraObject extends IMongoDocument {
    id: string;
    type: string;
    lastUpdatedAt: number;
    fields: {
        code?: string;
        abbrev?: string;
        displayName?: string;
        avatarUrl?: string;
        role?: string;
        color?: string;
        projectCode?: string;
        startDate?: string;
        endDate?: string;

        [key: string]: string;
    }
}

const JiraObject = MongoModel.createCollection<IJiraObject>('jira_object', {
    indexes: [
        { name: 'id', index: { id: 1 }, opts: { unique: true } },
        { name: 'type', index: { type: 1 } },
        { name: 'fields.displayName', index: { 'fields.displayName': 1 } },
        { name: 'text', index: { 'fields.displayName': 'text', 'fields.code': 'text', 'fields.abbrev': 'text' }, opts: { default_language: 'none' } },
        { name: 'lastUpdatedAt', index: { lastUpdatedAt: -1 } },
    ]
})

export default JiraObject