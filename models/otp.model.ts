// models/otp.ts
import { ObjectId } from 'mongodb';
import { IMongoDocument, MongoModel } from '../utils/mongo-model';

export enum OTP_TYPE {
    LOGIN = 'LOGIN',
    TELEGRAM_LINK = 'TELEGRAM_LINK'
}

export interface IOTP extends IMongoDocument {
    otp: string;
    userId: ObjectId;
    type: OTP_TYPE;
    expiresAt: number;
    telegramUserId?: number;
}

export const OTP = MongoModel.createCollection<IOTP>('otp', {
    indexes: [
        { name: 'otp', index: { otp: 1 } },
        { name: 'userId', index: { userId: 1 } },
        { name: 'expiresAt', index: { expiresAt: 1 } },
    ]
})

export default OTP;