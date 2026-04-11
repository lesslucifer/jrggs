process.env.NAME = 'jrggs-unit-test';
process.env.MONGO_CONNECTION = 'mongodb://localhost:27017';
process.env.MONGO_DB = 'jrggs_unit_test';
process.env.GG_KEY_FILE = 'dummy.json';
process.env.JIRA_HOST = 'https://jira.dummy.test';
process.env.JIRA_TOKEN = 'dummy-token';
process.env.BITBUCKET_API_BASE = 'https://bitbucket.dummy.test';
process.env.BITBUCKET_API_TOKEN = 'dummy-token';
process.env.BITBUCKET_USERNAME = 'dummy-user';
process.env.SYS_ADMIN_KEY = 'dummy-admin-key';

import sinon from 'sinon';
import { beforeAll, beforeEach, afterEach } from 'vitest';
import { initMockCollections } from './utils/stub-helpers';

let sandbox: sinon.SinonSandbox;

beforeAll(() => {
    initMockCollections();
});

beforeEach(() => {
    sandbox = sinon.createSandbox();
    (global as any).__sandbox = sandbox;
});

afterEach(() => {
    sandbox.restore();
});
