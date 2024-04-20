if (!process.env.config) {
    process.env.config = 'env.test.json';
}

import * as _ from 'lodash';
import 'mocha';
import Program from '../app';
import TestUtils from './utils/testutils';

before(async function () {
    this.timeout(300 * 1000);
    await Program.main();
    await TestUtils.initTestData()
})

after(async function () {
    this.timeout(60 * 1000);
    await TestUtils.dropDatabase();
})