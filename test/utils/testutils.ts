import '../integration-hook';
import supertest from 'supertest';
import Program from '../../app';

export class TestUtils {
    static envURL(url: string) {
        url = url.startsWith('/') ? url : `/${url}`
        return url;
    }

    static get Http() {
        return supertest(Program.server);
    }

    static async clearDatabase() {
    }

    static async dropDatabase() {
    }

    static async initTestData() {
    }
}

export default TestUtils;
