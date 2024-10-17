import { ObjectId } from 'bson';
import _ from 'lodash';
import sha1 from 'sha1';
import hera, { AppLogicError } from '../utils/hera';

import moment from 'moment';
import { customAlphabet, nanoid } from 'nanoid';
import { USER_ROLE } from '../glob/cf';
import ERR from '../glob/err';
import HC from '../glob/hc';
import User, { IUser, IUserCompactInfo } from '../models/user.model';
import AsyncLockExt, { Locked } from '../utils/async-lock-ext';
import UserAuth from '../models/user-auth.model';
import OTP, { OTP_TYPE } from '../models/otp.model';

export class UserServ {
    static registerLock = new AsyncLockExt()
    static otpGenerator = customAlphabet(HC.HUMAN32_ALPHABET)

    static getUser(uid: string) {
        const id = hera.mObjId(uid);
        return User.findOne({ _id: id });
    }

    static getUserCompactInfo(user: IUser): IUserCompactInfo {
        return _.pick(user, '_id', 'name', 'phone', 'email')
    }

    static async isValidPassword(userId: ObjectId, password: string) {
        const auth = await UserAuth.findOne({ user: userId });
        if (hera.isEmpty(auth)) {
            return false;
        }

        const _sha1 = this.genSHA1(password, auth.passwordSalt);
        if (_sha1 != auth.passwordSHA1) {
            return false;
        }

        return true;
    }

    static genSHA1(password: string, salt: string): string {
        return sha1(`${password}${salt}`);
    }

    static updatePassword(uid: ObjectId, newPass: string) {
        const salt = nanoid()
        const hash = UserServ.genSHA1(newPass, salt);
        return UserAuth.updateOne({ user: uid }, {
            $set: {
                user: uid,
                passwordSHA1: hash,
                passwordSalt: salt
            }
        }, { upsert: true });
    }

    static hasRole(user: IUser, ...roles: USER_ROLE[]) {
        if (!user || !user.roles) return false;

        return !!roles.find(r => user.roles.includes(r));
    }

    static generatePassword(len: number) {
        let s = ''
        for (let i = 0; i < len; ++i) {
            const n = Math.floor(Math.random() * 10)
            s += n;
        }

        return s;
    }

    @Locked(([info]) => info.email, UserServ.registerLock)
    static async registerNewUser(info: IRegUserInfo) {
        if (info.email && !hera.isValidEmailAddress(info.email)) throw new AppLogicError('Invalid email format')

        const duplicatedUser = await User.findOne({ email: info.email }, { projection: ['_id'] })
        if (duplicatedUser) throw new AppLogicError('Cannot create user! Email is already registered', 400);
        const user: IUser = {
            name: info.name,
            email: info.email,
            roles: info.roles,
            isBlocked: false,
            createdAt: Date.now(),
            updatedAt: Date.now()
        }
        const result = await User.insertOne(user);

        if (!result.insertedId) throw new AppLogicError('Cannot create user! Cannot insert user', 500);

        await UserServ.updatePassword(result.insertedId, info.password);

        return result.insertedId
    }

    static async generateResetPasswordToken(userId: ObjectId, now: moment.Moment) {
        const token = UserServ.genSHA1(`${now.valueOf()}`, userId.toHexString())
        const tokenExpire = now.clone().add(6, 'h').valueOf()

        await User.updateOne({ _id: userId }, {
            $set: {
                resetPasswordToken: token,
                resetPasswordExpired: tokenExpire
            }
        })

        return token
    }

    static async getMeOrAnyUserIdByAdmin(uid: string, user: IUser) {
        if (uid.toLowerCase() === 'me') return user._id
        if (user.roles.includes(USER_ROLE.ADMIN)) return hera.mObjId(uid)

        throw new AppLogicError(`Cannot parse uid = ${uid}`, 400)
    }

    static async generateLoginOTP(uid: string) {
        const otp = this.otpGenerator(32)

        await OTP.insertOne({
            otp,
            userId: new ObjectId(uid),
            type: OTP_TYPE.LOGIN,
            expiresAt: Date.now() + HC.OTP_EXPIRATION_SECS * 1000,
        });

        return otp;
    }

    static async getUserWithLoginOTP(otp: string) {
        const otpDoc = await OTP.findOneAndDelete({
            otp,
            type: OTP_TYPE.LOGIN,
            expiresAt: { $gt: Date.now() },
        });

        if (!otpDoc) {
            throw new AppLogicError(`Invalid or expired OTP: ${otp}`, 401);
        }

        const user = await User.findOne({ _id: otpDoc.userId });

        if (!user || user.isBlocked) {
            throw new AppLogicError('Invalid OTP! Invalid user or user is blocked', 400, ERR.INVALID_OBJECT_STATUS);
        }

        return user;
    }
}

export interface IRegUserInfo {
    name: string;
    email: string;
    password: string;
    roles: USER_ROLE[];
}