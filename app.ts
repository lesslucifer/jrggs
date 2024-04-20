import * as bodyParser from 'body-parser';
import express from 'express';
import { APIInfo, ExpressRouter } from 'express-router-ts';
import { Server } from 'http';
import CONN from './glob/conn';
import { ENV } from './glob/env';
import cors from './utils/cors';
import { AppApiResponse, AppLogicError } from './utils/hera';
import winston = require('winston/lib/winston/config');
import terminate from './serv/terminate';
import createSesssionObject from './serv/sess';
import _ from 'lodash';

export class Program {
    static server: express.Express;

    public static async setup() {
        await CONN.configureConnections(ENV);

        // AuthServ.MODEL = UserServ

        const server = express();
        this.server = server;
        server.use(bodyParser.json(<any>{limit: '10mb', extended: true}));
        server.use(createSesssionObject());
        server.all('*', cors());

        APIInfo.Logging = (winston.npm.levels[ENV.LOG_LEVEL] || 0) > 2 // greater than info level
        await ExpressRouter.loadDir(server, `${__dirname}/routes`, {
            log: console.error.bind(console)
        })
        // Express router
        ExpressRouter.ResponseHandler = this.expressRouterResponse.bind(this)
        ExpressRouter.ErrorHandler = this.expressRouterError.bind(this)
        server.all('*', (req, resp) => {
            if (req.session.user || req.session.system) return this.expressRouterError(new AppLogicError(`Permission denied!`, 403), req, resp);
            return this.expressRouterError(new AppLogicError(`Cannot ${req.method} ${req.url}! API not found`, 404), req, resp)
        });
    }

    public static async main(): Promise<number> {
        await this.setup()

        const appServer = await new Promise<Server>(resolve => {
            resolve(
                this.server.listen(ENV.HTTP_PORT, () => console.log(`Listen on port ${ENV.HTTP_PORT}...`))
            )
        });

        const exitHandler = terminate(appServer, {
            coredump: false,
            timeout: 500
        })
        process.on('uncaughtException', exitHandler(1, 'Unexpected Error'))
        process.on('unhandledRejection', exitHandler(1, 'Unhandled Promise'))
        process.on('SIGTERM', exitHandler(0, 'SIGTERM'))
        process.on('SIGINT', exitHandler(0, 'SIGINT'))

        return 0;
    }

    static expressRouterResponse(data: any, req: express.Request, resp: express.Response) {
        let appResp = new AppApiResponse();
        if (data instanceof AppApiResponse) {
            appResp = data;
        }
        else {
            appResp.success = true;
            appResp.httpCode = 200;
            appResp.data = data;
        }

        this.doResponse(appResp, resp);
    }

    static expressRouterError(err: any, req: express.Request, resp: express.Response) {
        let appResp = new AppApiResponse();
        appResp.success = false;
        appResp.err = {
            message: err.message || 'Unknown error',
            code: err.code,
            params: err.params
        }
        appResp.httpCode = _.isNumber(err.httpCode) ? err.httpCode : 500;

        console.error(err, req);
        this.doResponse(appResp, resp);
    }

    static doResponse(appResp: AppApiResponse, resp: express.Response) {
        // Remove http code from response body
        if (_.isNumber(appResp.httpCode)) {
            resp.statusCode = appResp.httpCode;
        }
        delete appResp.httpCode;

        // Remove headers from response body
        if (!_.isEmpty(appResp.headers)) {
            _.keys(appResp.headers).forEach(h => resp.setHeader(h, appResp.headers[h]));
        }
        delete appResp.headers;

        resp.send(appResp);
    }
}

if (require.main == module) { // this is main file
    Program.main();
}

export default Program;
