import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import TestUtils from '../utils/testutils';
import { KudoCategory } from '../../models/kudo.mongo';
import Kudo from '../../models/kudo.mongo';
import KudoEligibleGiver from '../../models/kudo-eligible-giver.mongo';
import User from '../../models/user.mongo';
import { ObjectId } from 'mongodb';
import { USER_ROLE } from '../../glob/cf';

const SYS_ADMIN_KEY = '123';

const ELIGIBLE_JIRA_ID = 'test-jira-id-eligible';
const REGULAR_JIRA_ID = 'test-jira-id-regular';

async function createUser(email: string, roles: USER_ROLE[]): Promise<{ userId: string; token: string }> {
    const createResp = await TestUtils.Http
        .post(TestUtils.envURL('/users'))
        .set('x-api-key', SYS_ADMIN_KEY)
        .send({ name: email, email, password: 'password123', roles });
    if (createResp.status !== 200) throw new Error(`Failed to create user ${email}: ${createResp.status} ${JSON.stringify(createResp.body)}`);
    const userId = createResp.body.data._id;

    const loginResp = await TestUtils.Http
        .post(TestUtils.envURL('/auth/login'))
        .send({ email, password: 'password123' });
    if (loginResp.status !== 200) throw new Error(`Failed to login ${email}: ${loginResp.status}`);
    const token = loginResp.body.data.access_token;

    return { userId, token };
}

describe('# Kudos API:', () => {
    let adminToken: string;
    let userToken: string;
    let eligibleUserToken: string;

    let adminUserId: string;
    let regularUserId: string;
    let eligibleUserId: string;

    beforeAll(async () => {
        const suffix = Date.now();
        const admin = await createUser(`kudos_admin_${suffix}@test.com`, [USER_ROLE.USER, USER_ROLE.ADMIN]);
        adminToken = admin.token;
        adminUserId = admin.userId;

        const regular = await createUser(`kudos_user_${suffix}@test.com`, [USER_ROLE.USER]);
        userToken = regular.token;
        regularUserId = regular.userId;

        const eligible = await createUser(`kudos_eligible_${suffix}@test.com`, [USER_ROLE.USER]);
        eligibleUserToken = eligible.token;
        eligibleUserId = eligible.userId;

        await TestUtils.Http
            .put(TestUtils.envURL(`/users/${regularUserId}`))
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ jiraUserId: REGULAR_JIRA_ID });

        await TestUtils.Http
            .put(TestUtils.envURL(`/users/${eligibleUserId}`))
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ jiraUserId: ELIGIBLE_JIRA_ID });
    });

    afterAll(async () => {
        await Kudo.deleteMany({ fromUserId: { $in: [ELIGIBLE_JIRA_ID] } });
        await KudoEligibleGiver.deleteMany({ userId: { $in: [adminUserId, regularUserId, eligibleUserId] } });
        await User.deleteMany({ _id: { $in: [adminUserId, regularUserId, eligibleUserId].map(id => new ObjectId(id)) } });
    });

    describe('POST /kudos/eligible-givers (admin only)', () => {
        it('admin can add an eligible giver', async () => {
            const resp = await TestUtils.Http
                .post(TestUtils.envURL('/kudos/eligible-givers'))
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ userId: eligibleUserId });
            expect(resp.status).toBe(200);
        });

        it('non-admin cannot add an eligible giver', async () => {
            const resp = await TestUtils.Http
                .post(TestUtils.envURL('/kudos/eligible-givers'))
                .set('Authorization', `Bearer ${userToken}`)
                .send({ userId: eligibleUserId });
            expect(resp.status).toBe(403);
        });

        it('adding a duplicate is idempotent', async () => {
            const resp = await TestUtils.Http
                .post(TestUtils.envURL('/kudos/eligible-givers'))
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ userId: eligibleUserId });
            expect(resp.status).toBe(200);
        });

        it('adding non-existent user returns 400', async () => {
            const resp = await TestUtils.Http
                .post(TestUtils.envURL('/kudos/eligible-givers'))
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ userId: '000000000000000000000000' });
            expect(resp.status).toBe(400);
        });
    });

    describe('GET /kudos/eligible-givers (admin only)', () => {
        it('admin can list eligible givers', async () => {
            const resp = await TestUtils.Http
                .get(TestUtils.envURL('/kudos/eligible-givers'))
                .set('Authorization', `Bearer ${adminToken}`);
            expect(resp.status).toBe(200);
            expect(resp.body.data).toBeInstanceOf(Array);
        });

        it('non-admin cannot list eligible givers', async () => {
            const resp = await TestUtils.Http
                .get(TestUtils.envURL('/kudos/eligible-givers'))
                .set('Authorization', `Bearer ${userToken}`);
            expect(resp.status).toBe(403);
        });
    });

    describe('GET /kudos/eligible-givers/me', () => {
        it('returns eligible=true and jiraUserId for eligible giver', async () => {
            const resp = await TestUtils.Http
                .get(TestUtils.envURL('/kudos/eligible-givers/me'))
                .set('Authorization', `Bearer ${eligibleUserToken}`);
            expect(resp.status).toBe(200);
            expect(resp.body.data.eligible).toBe(true);
            expect(resp.body.data.jiraUserId).toBe(ELIGIBLE_JIRA_ID);
        });

        it('returns eligible=false for non-eligible user', async () => {
            const resp = await TestUtils.Http
                .get(TestUtils.envURL('/kudos/eligible-givers/me'))
                .set('Authorization', `Bearer ${userToken}`);
            expect(resp.status).toBe(200);
            expect(resp.body.data.eligible).toBe(false);
        });
    });

    describe('POST /kudos', () => {
        it('eligible giver can give a kudo', async () => {
            const resp = await TestUtils.Http
                .post(TestUtils.envURL('/kudos'))
                .set('Authorization', `Bearer ${eligibleUserToken}`)
                .send({ toUserId: REGULAR_JIRA_ID, category: KudoCategory.TEAMWORK });
            expect(resp.status).toBe(200);
            expect(resp.body.data).toMatchObject({ fromUserId: ELIGIBLE_JIRA_ID, toUserId: REGULAR_JIRA_ID, category: KudoCategory.TEAMWORK });
        });

        it('eligible giver can give a kudo with optional message', async () => {
            const resp = await TestUtils.Http
                .post(TestUtils.envURL('/kudos'))
                .set('Authorization', `Bearer ${eligibleUserToken}`)
                .send({ toUserId: REGULAR_JIRA_ID, category: KudoCategory.MENTORING, message: 'Great help!' });
            expect(resp.status).toBe(200);
            expect(resp.body.data.message).toBe('Great help!');
        });

        it('self-kudo is blocked', async () => {
            const resp = await TestUtils.Http
                .post(TestUtils.envURL('/kudos'))
                .set('Authorization', `Bearer ${eligibleUserToken}`)
                .send({ toUserId: ELIGIBLE_JIRA_ID, category: KudoCategory.TEAMWORK });
            expect(resp.status).toBe(400);
        });

        it('non-eligible user cannot give a kudo', async () => {
            const resp = await TestUtils.Http
                .post(TestUtils.envURL('/kudos'))
                .set('Authorization', `Bearer ${userToken}`)
                .send({ toUserId: REGULAR_JIRA_ID, category: KudoCategory.TEAMWORK });
            expect(resp.status).toBe(403);
        });

        it('invalid category returns 400', async () => {
            const resp = await TestUtils.Http
                .post(TestUtils.envURL('/kudos'))
                .set('Authorization', `Bearer ${eligibleUserToken}`)
                .send({ toUserId: REGULAR_JIRA_ID, category: 'INVALID_CATEGORY' });
            expect(resp.status).toBe(400);
        });

        it('user without jiraUserId cannot give a kudo', async () => {
            const suffix = Date.now();
            const noJira = await createUser(`kudos_nojira_${suffix}@test.com`, [USER_ROLE.USER]);
            await TestUtils.Http
                .post(TestUtils.envURL('/kudos/eligible-givers'))
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ userId: noJira.userId });
            const resp = await TestUtils.Http
                .post(TestUtils.envURL('/kudos'))
                .set('Authorization', `Bearer ${noJira.token}`)
                .send({ toUserId: REGULAR_JIRA_ID, category: KudoCategory.TEAMWORK });
            expect(resp.status).toBe(400);
            await User.deleteOne({ _id: new ObjectId(noJira.userId) });
            await KudoEligibleGiver.deleteOne({ userId: noJira.userId });
        });
    });

    describe('GET /kudos', () => {
        it('returns kudos sorted by newest first', async () => {
            const resp = await TestUtils.Http
                .get(TestUtils.envURL('/kudos?$fields=*,category&$sort=createdAt:-1'))
                .set('Authorization', `Bearer ${userToken}`);
            expect(resp.status).toBe(200);
            const kudos = resp.body.data;
            expect(kudos).toBeInstanceOf(Array);
            for (let i = 1; i < kudos.length; i++) {
                expect(kudos[i - 1].createdAt).toBeGreaterThanOrEqual(kudos[i].createdAt);
            }
        });

        it('filters by category', async () => {
            const resp = await TestUtils.Http
                .get(TestUtils.envURL(`/kudos?$fields=*,category,category&category=${KudoCategory.TEAMWORK}`))
                .set('Authorization', `Bearer ${userToken}`);
            expect(resp.status).toBe(200);
            const kudos = resp.body.data;
            kudos.forEach((k: any) => expect(k.category).toBe(KudoCategory.TEAMWORK));
        });

        it('filters by toUserId', async () => {
            const resp = await TestUtils.Http
                .get(TestUtils.envURL(`/kudos?$fields=*,category&toUserId=${REGULAR_JIRA_ID}`))
                .set('Authorization', `Bearer ${userToken}`);
            expect(resp.status).toBe(200);
            const kudos = resp.body.data;
            kudos.forEach((k: any) => expect(k.toUserId).toBe(REGULAR_JIRA_ID));
        });

        it('returns empty array when no kudos in date range', async () => {
            const resp = await TestUtils.Http
                .get(TestUtils.envURL('/kudos?$fields=*,category&$from=createdAt:946684800000&$to=createdAt:949363200000'))
                .set('Authorization', `Bearer ${userToken}`);
            expect(resp.status).toBe(200);
            expect(resp.body.data).toEqual([]);
        });
    });

    describe('DELETE /kudos/eligible-givers/:userId (admin only)', () => {
        it('non-admin cannot remove an eligible giver', async () => {
            const resp = await TestUtils.Http
                .delete(TestUtils.envURL(`/kudos/eligible-givers/${eligibleUserId}`))
                .set('Authorization', `Bearer ${userToken}`);
            expect(resp.status).toBe(403);
        });

        it('admin can remove an eligible giver', async () => {
            const resp = await TestUtils.Http
                .delete(TestUtils.envURL(`/kudos/eligible-givers/${eligibleUserId}`))
                .set('Authorization', `Bearer ${adminToken}`);
            expect(resp.status).toBe(200);
        });

        it('removing non-existent eligible giver returns 400', async () => {
            const resp = await TestUtils.Http
                .delete(TestUtils.envURL(`/kudos/eligible-givers/${eligibleUserId}`))
                .set('Authorization', `Bearer ${adminToken}`);
            expect(resp.status).toBe(400);
        });
    });
});
