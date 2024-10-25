import { USER_ROLE } from '../glob/cf';
import { IMongoDocument, MongoModel } from '../utils/mongo-model';

export interface IUserCompactInfo extends IMongoDocument {
    name: string;
    phone?: string;
    email: string;
}

export interface IUser extends IUserCompactInfo {
    roles: USER_ROLE[];
    isBlocked?: boolean;

    createdAt: number;
    updatedAt: number;

    forceResetPasswordAt?: number;
}

const User = MongoModel.createCollection<IUser>('user', {
    indexes: [
        { name: 'email_1_unique', index: { email: 1 }, opts: { unique: true } },
        { name: 'createdAt', index: { createdAt: 1 } },
        { name: 'updatedAt', index: { updatedAt: 1 } },
        { name: 'roles', index: { roles: 1 } },
        { name: 'isBlocked', index: { isBlocked: 1 } },
    ],
    dropIndexes: [
        'phone',
        'email_hashed_unique'
    ]
});

export default User;