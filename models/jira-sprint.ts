import { IMongoDocument, MongoModel } from "../utils/mongo-model";

export interface IJiraSprint extends IMongoDocument {
    id: number;
    projectKey: string;
    name: string;
    startDate: string;
    endDate: string;
    createdDate: string;
    originBoardId?: number;
    lastUpdateTime: number;
}

const JiraSprint = MongoModel.createCollection<IJiraSprint>('jira_sprint', {
    indexes: [
        { name: 'id', index: { id: 1 }, opts: { unique: true } },
        { name: 'projectKey', index: { projectKey: 1 } },
        { name: 'lastUpdateTime', index: { lastUpdateTime: -1 } },
    ],
    timeseries: {
        name: 'lastUpdateTime',
        timeField: 'lastUpdateTime',
        metaField: 'id',
        granularity: 'minutes'
    }
})

export default JiraSprint