import express from 'express';
import { ExpressRouter } from 'express-router-ts';
import authRouter from '../routes/auth';
import bitbucketPrsRouter from '../routes/bitbucket-prs';
import changeRequestsRouter from '../routes/change-requests';
import healthzRouter from '../routes/healthz';
import jiraIssuesRouter from '../routes/jira-issues';
import jiraObjectsRouter from '../routes/jira-objects';
import kudosRouter from '../routes/kudos';
import reportsRouter from '../routes/reports';
import telegramRouter from '../routes/telegram';
import usersRouter from '../routes/users';

const routers: { path: string; router: ExpressRouter }[] = [
    { path: '/auth', router: authRouter },
    { path: '/bitbucket-prs', router: bitbucketPrsRouter },
    { path: '/change-requests', router: changeRequestsRouter },
    { path: '/healthz', router: healthzRouter },
    { path: '/jira-issues', router: jiraIssuesRouter },
    { path: '/jira-objects', router: jiraObjectsRouter },
    { path: '/kudos', router: kudosRouter },
    { path: '/reports', router: reportsRouter },
    { path: '/telegram', router: telegramRouter },
    { path: '/users', router: usersRouter },
];

export function loadRouters(server: express.Express) {
    for (const r of routers) {
        r.router.server = server;
        server.use(r.path, r.router.Router);
    }
}
