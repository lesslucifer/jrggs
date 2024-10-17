import * as express from 'express';
import _ from 'lodash';

import * as C from '../glob/cf';
import ERR from '../glob/err';
import hera, { AppLogicError } from '../utils/hera';

import { Body, ExpressRouter, GET, POST, PUT, Params, Req } from 'express-router-ts';
import moment from 'moment';
import User, { IUser } from '../models/user.model';
import AuthServ from '../serv/auth';
import { ValidBody, Caller } from '../utils/decors';
import { OTP_TYPE } from '../models/otp.model';
import { UserServ } from '../serv/user';

export class AuthRouter extends ExpressRouter {
    @ValidBody({
        '+@email': 'string',
        '+@password': 'string',
        '++': false
    })
    @POST({ path: '/login' })
    async login(@Body() body: ILoginBody) {
        const email: string = body.email;
        const password: string = body.password;

        const user = await User.findOne({ email });

        if (!user || user.isBlocked) {
            throw new AppLogicError('Cannot login! Invalid user or user is blocked', 400, ERR.INVALID_OBJECT_STATUS);
        }

        const isPasswordCorrect = user && await UserServ.isValidPassword(user._id, password)
        if (!isPasswordCorrect) {
            throw new AppLogicError('Cannot login! Invalid username or password', 400, ERR.INVALID_USERNAME_OR_PASSWORD);
        }

        if (user.forceResetPasswordAt) {
            const token = await UserServ.generateResetPasswordToken(user._id, moment())
            return {
                resetPasswordToken: token
            }
        }
        const token = await AuthServ.authenticator.genTokens({
            id: user._id.toHexString(),
            scope: '*'
        });

        return {
            ...token,
            roles: user.roles
        }
    }

    @ValidBody({
        '+@refresh_token': 'string',
        '@ext': 'string'
    })
    @POST({ path: '/token' })
    async renewToken(@Body() body: IRenewTokenBody) {
        const refreshToken = body.refresh_token;
        const expires = Math.floor(Date.now() / 1000) + AuthServ.authenticator.accessTokenExpires;
        const accessToken = await AuthServ.authenticator.genAccessToken(refreshToken);

        const auth = await AuthServ.authenticator.getUser(accessToken);
        const user = await User.findOne({ _id: hera.mObjId(auth.id as string) });
        if (!user || user.isBlocked) {
            throw new AppLogicError('Cannot refresh token! Invalid token', 400, ERR.OBJECT_NOT_FOUND);
        }

        if (user.forceResetPasswordAt) {
            const token = await UserServ.generateResetPasswordToken(user._id, moment())
            return {
                resetPasswordToken: token
            }
        }

        const tokens = {
            access_token: accessToken,
            expires_in: expires,
            refresh_token: refreshToken,
            token_type: 'bearer',
            scope: auth.scope
        }

        return {
            ...tokens,
            roles: user.roles
        };
    }

    @PUT({ path: '/logout' })
    @ValidBody({
        '@access_token?': 'string',
        '@refresh_token?': 'string',
    })
    async logout(@Body() body: ILogoutBody) {
        const accessToken: string = body.access_token;
        const auth = await AuthServ.authenticator.getUser(accessToken);
        const uid = hera.mObjId(auth.id as string);
        await User.updateOne({ _id: uid }, { $set: { ext: null } });

        AuthServ.authenticator.revokeToken(accessToken);
        AuthServ.authenticator.revokeToken(body.refresh_token);
    }

    @ValidBody({
        '+@name': 'string',
        '@email': 'string',
        '+@password': 'string|>=8',
        '++': false
    })
    @POST({ path: '/reg' })
    async reg(@Req() req: express.Request, @Body() body: IRegUserBody) {
        const newUserId = await UserServ.registerNewUser({
            name: body.name,
            email: body.email,
            password: body.password,
            roles: []
        })

        return {
            _id: newUserId
        }
    }

    @ValidBody({
        '+@info': 'string|len<1000'
    })
    @POST({ path: '/forgot-password' })
    async forgotPassword(@Req() req: express.Request, @Body('info') info: string) {
        const now = moment()
        const user = await User.findOne({ $or: [{ email: info }, { phone: info }] });
        if (!user) return {};

        const token = await UserServ.generateResetPasswordToken(user._id, now)
        const url = `https://gh.concon.vn/reset-password?token=${token}`

        if (hera.isValidEmailAddress(user.email)) {
            // TODO: send email
            // const forgotPasswordTemplate = await MessagingServ.getEmailTemplate('reset_password');
            // const mailContent = MessagingServ.parseContent(forgotPasswordTemplate, { info: info, url: url });
            // MessagingServ.sendEmail('[Gạo Hạt] - Đặt lại mật khẩu', mailContent, user.email)
        }

        return {}
    }

    @AuthServ.authUser(C.USER_ROLE.ADMIN)
    @GET({ path: '/otp/:uid' })
    async generateLoginOTP(@Caller() user: IUser, @Params('uid') uid: string) {
        const otp = await UserServ.generateLoginOTP(uid);
        return {
            otp
        };
    }

    @ValidBody({
        '+@otp': 'string'
    })
    @POST({ path: '/otpLogin' })
    async loginWithOTP(@Body('otp') otp: string) {
        const user = await UserServ.getUserWithLoginOTP(otp);

        const token = await AuthServ.authenticator.genTokens({
            id: user._id.toHexString(),
            scope: '*'
        });

        return {
            ...token,
            roles: user.roles
        }
    }
}

export interface ILoginBody {
    email: string;
    password: string;
}

export interface IRenewTokenBody {
    refresh_token: string;
}

export interface ILogoutBody {
    access_token?: string;
    refresh_token?: string;
    device_token?: string;
}

export interface ICheckVersionBody {
    app: string;
    version: string;
}

export interface IRegUserBody {
    name: string
    email: string
    password: string
}

export default new AuthRouter();