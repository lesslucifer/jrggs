import { describe, it, expect } from 'vitest';
import TestUtils from '../utils/testutils';

describe("# Health test:", () => {
    describe('POST /healthz', () => {
        it('health check should be ok', async () => {
            const resp = await TestUtils.Http.get(TestUtils.envURL('/healthz'));
            expect(resp.status).toBe(200);
        });
    });
});
