import _ from 'lodash';
import TestUtils from '../utils/testutils';
import { expect } from 'chai';
import sinon from 'sinon';

describe("# Health test:", () => {
    let sandbox: sinon.SinonSandbox;

    before(async () => {
    })

    after(async () => {
        // await TestUtils.clearDatabase();
    });

    beforeEach(async () => {
        sandbox = sinon.createSandbox();
    });

    afterEach(async () => {
        sandbox.restore();
    });

    describe('POST /healthz', async () => {
        it('health check should be ok', async () => {
            const resp = await TestUtils.Http.get(TestUtils.envURL('/healthz')).send();
            expect(resp).to.have.status(200);
        });
    });
});