import { IMongoDocument, MongoModel } from '../utils/mongo-model';

export interface IKudoEligibleGiver extends IMongoDocument {
    userId: string;
    addedBy: string;
    addedAt: number;
}

const KudoEligibleGiver = MongoModel.createCollection<IKudoEligibleGiver>('kudo_eligible_givers', {
    indexes: [
        { name: 'userId_1_unique', index: { userId: 1 }, opts: { unique: true } },
    ]
});

export default KudoEligibleGiver;
