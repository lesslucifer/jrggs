import _ from 'lodash';
import '../hook';
import chai = require('chai');
import chaiAsPromised = require('chai-as-promised');
import chaiHttp = require('chai-http');
import spies = require('chai-spies');
import 'mocha';
import ENV from '../../glob/env';
import Program from '../../app';
import moment = require('moment');

chai.use(<any>spies);
chai.use(chaiAsPromised);
chai.use(chaiHttp);

export class TestUtils {
    static envURL(url: string) {
        url = url.startsWith('/') ? url : `/${url}`
        // url = `${ENV.BASE_PATH}${url}`
        return url;
    }

    static get Http() {
        return chai.request(Program.server);
    }

    static async clearDatabase() {
    }

    static async dropDatabase() {
    }

    static async initTestData() {
    }
}

export default TestUtils;