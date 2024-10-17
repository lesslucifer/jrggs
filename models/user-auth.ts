import { ObjectId } from 'mongodb';
import { IMongoDocument, MongoModel } from '../utils/mongo-model';

export interface IUserAuth extends IMongoDocument {
    user: ObjectId;

    passwordSHA1: string;
    passwordSalt: string;
}

const UserAuth = MongoModel.createCollection<IUserAuth>('user_auth', {
    indexes: [
        { name: 'user', index: { user: 1 }, opts: { unique: true } },
        { name: 'passwordSHA1', index: { passwordSHA1: 'hashed' } },
    ]
});

export default UserAuth;