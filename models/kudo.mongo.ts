import { IMongoDocument, MongoModel } from '../utils/mongo-model';

export interface IKudo extends IMongoDocument {
    fromUserId: string;
    toUserId: string;
    message?: string;
    createdAt: number;
}

const Kudo = MongoModel.createCollection<IKudo>('kudos', {
    indexes: [
        { name: 'createdAt_1_toUserId_1', index: { createdAt: 1, toUserId: 1 } },
        { name: 'fromUserId_1_createdAt_1', index: { fromUserId: 1, createdAt: 1 } },
        { name: 'toUserId_1_createdAt_1', index: { toUserId: 1, createdAt: 1 } },
    ]
});

export default Kudo;
