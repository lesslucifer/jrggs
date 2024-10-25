import * as express from 'express';

import { USER_ROLE } from '../glob/cf';
import { IAuthUser, IAuthenticator, JWTAuth } from '../utils/auth';
import hera, { AppLogicError } from '../utils/hera';

import { ExpressRouter, addMiddlewareDecor } from 'express-router-ts';
import ENV from '../glob/env';
import { IUser } from '../models/user.mongo';
import _ from 'lodash';
import { UserServ } from './user';
import { GoogleAuthService } from './google-auth.serv';

export interface IAuthUserModel {
    getUser(uid: string): Promise<IUser>;
}

export class AuthServ {
    static readonly authenticator: IAuthenticator = new JWTAuth(ENV.AUTH_SECRECT_KEY, ENV.AUTH_ACCESS_TOKEN_EXPIRES, ENV.AUTH_REFRESH_TOKEN_EXPIRES);
    static readonly googleAuthService = new GoogleAuthService();

    static authSysAdmin() {
        return addMiddlewareDecor(async (req: express.Request) => {
            req.session.authRequired = true;
            if (!req.session.system) {
                const apiKey = req.header('x-api-key') || req.query.apikey || (req.body && req.body.apikey);
                if (hera.isEmpty(apiKey)) throw ExpressRouter.NEXT;
                
                if (ENV.SYS_ADMIN_KEY && ENV.SYS_ADMIN_KEY == apiKey) {
                    req.session.system = 'ENV';
                    return
                }
                
                throw ExpressRouter.NEXT
            }
        })
    }

    static authUser(...reqRoles: USER_ROLE[]) {
        return addMiddlewareDecor(async (req: express.Request) => {
            req.session.authRequired = true;
            if (!req.session.user) {
                const accessToken = this.getTokenFromRequest(req);
                if (hera.isEmpty(accessToken)) throw ExpressRouter.NEXT; // new AppLogicError(`Unauthorized, Invalid access token`, 403);
            
                let authUser: IAuthUser = null;
                try {
                    authUser = await this.authenticator.getUser(accessToken);
                }
                catch (err) {
                    throw new AppLogicError(`Unauthorized! ${err}`, 401);
                }
    
                const user = await UserServ.getUser(authUser.id as string);
                if (hera.isEmpty(user) || user.isBlocked) throw new AppLogicError('Unauthorized! User is invalid or deactive or deleted', 401);
    
                this.authenticator.renewToken(accessToken);
                req.session.user = user;
            }

            const user = req.session.user
            const asRole = req.header('x-as') as USER_ROLE
            if (asRole) {
                if (!USER_ROLE[asRole] || !user.roles.includes(asRole)) throw new AppLogicError('Invalid role! User does not have the preferred role', 403);
            }

            if (reqRoles.length > 0) {
                const user = req.session.user;
                const matchedRoles = reqRoles.filter(r => user.roles.includes(r))
                if (!matchedRoles.length) throw ExpressRouter.NEXT;
            }
        });
    }

    static getTokenFromRequest(req: express.Request): string {
        const BearerPrefixes = ['Bearer ', 'bearer '];

        const token = req.header('Authorization') ?? null;
        if (!token) return token;

        const prefix = BearerPrefixes.find((pre) => token.startsWith(pre));
        if (prefix) return token.substring(prefix.length);

        return token;
    }
}

export default AuthServ;