import * as express from 'express';
import * as uuid from 'uuid';
import { IUser } from '../models/user';

interface IReqSession {
    authRequired?: boolean;
    user?: IUser;
    system?: string;
}

declare module "express-serve-static-core" {
    interface Request {
        nonce: string;
        session: IReqSession
    }
}

export default function createSesssionObject(): express.RequestHandler {
    return (req, resp, next) => {
        req.session = {};
        req.nonce = uuid.v4();
        next();
    };
}

