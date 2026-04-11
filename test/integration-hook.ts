if (!process.env.config) {
    process.env.config = 'env.test.json';
}

import 'lodash';
import Program from '../app';
import TestUtils from './utils/testutils';
import { beforeAll, afterAll } from 'vitest';

beforeAll(async () => {
    await Program.main();
    await TestUtils.initTestData()
}, 300_000)

afterAll(async () => {
    await TestUtils.dropDatabase();
}, 60_000)
