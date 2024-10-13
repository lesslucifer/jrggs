import { IMongoDocument, MongoModel } from "../utils/mongo-model";

export interface IAppConfig extends IMongoDocument {
    key: string;
    value: any;
}

const AppConfig = MongoModel.createCollection<IAppConfig>('app_config', {
    indexes: [
        { name: 'key', index: { key: 1 }, opts: { unique: true } },
    ]
})

export default AppConfig