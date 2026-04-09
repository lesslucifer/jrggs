import { expect } from 'chai';
import TestUtils from '../utils/testutils';
import { KudoCategory } from '../../models/kudo.mongo';

describe('# Kudos API:', () => {
    let adminToken: string;
    let userToken: string;
    let eligibleUserToken: string;

    let adminUserId: string;
    let regularUserId: string;
    let eligibleUserId: string;

    before(async () => {
    })

    after(async () => {
    })

    describe('POST /kudos/eligible-givers (admin only)', () => {
        it('admin can add an eligible giver', async () => {
            const resp = await TestUtils.Http
                .post(TestUtils.envURL('/kudos/eligible-givers'))
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ userId: eligibleUserId });
            expect(resp).to.have.status(200);
        });

        it('non-admin cannot add an eligible giver', async () => {
            const resp = await TestUtils.Http
                .post(TestUtils.envURL('/kudos/eligible-givers'))
                .set('Authorization', `Bearer ${userToken}`)
                .send({ userId: eligibleUserId });
            expect(resp).to.have.status(403);
        });

        it('adding a duplicate is idempotent', async () => {
            const resp = await TestUtils.Http
                .post(TestUtils.envURL('/kudos/eligible-givers'))
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ userId: eligibleUserId });
            expect(resp).to.have.status(200);
        });

        it('adding non-existent user returns 400', async () => {
            const resp = await TestUtils.Http
                .post(TestUtils.envURL('/kudos/eligible-givers'))
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ userId: '000000000000000000000000' });
            expect(resp).to.have.status(400);
        });
    });

    describe('GET /kudos/eligible-givers (admin only)', () => {
        it('admin can list eligible givers', async () => {
            const resp = await TestUtils.Http
                .get(TestUtils.envURL('/kudos/eligible-givers'))
                .set('Authorization', `Bearer ${adminToken}`)
                .send();
            expect(resp).to.have.status(200);
            expect(resp.body.data).to.be.an('array');
        });

        it('non-admin cannot list eligible givers', async () => {
            const resp = await TestUtils.Http
                .get(TestUtils.envURL('/kudos/eligible-givers'))
                .set('Authorization', `Bearer ${userToken}`)
                .send();
            expect(resp).to.have.status(403);
        });
    });

    describe('GET /kudos/eligible-givers/me', () => {
        it('returns eligible=true for eligible giver', async () => {
            const resp = await TestUtils.Http
                .get(TestUtils.envURL('/kudos/eligible-givers/me'))
                .set('Authorization', `Bearer ${eligibleUserToken}`)
                .send();
            expect(resp).to.have.status(200);
            expect(resp.body.data.eligible).to.equal(true);
        });

        it('returns eligible=false for non-eligible user', async () => {
            const resp = await TestUtils.Http
                .get(TestUtils.envURL('/kudos/eligible-givers/me'))
                .set('Authorization', `Bearer ${userToken}`)
                .send();
            expect(resp).to.have.status(200);
            expect(resp.body.data.eligible).to.equal(false);
        });
    });

    describe('POST /kudos', () => {
        it('eligible giver can give a kudo', async () => {
            const resp = await TestUtils.Http
                .post(TestUtils.envURL('/kudos'))
                .set('Authorization', `Bearer ${eligibleUserToken}`)
                .send({ toUserId: regularUserId, category: KudoCategory.TEAMWORK });
            expect(resp).to.have.status(200);
            expect(resp.body.data).to.include({ fromUserId: eligibleUserId, toUserId: regularUserId, category: KudoCategory.TEAMWORK });
        });

        it('eligible giver can give a kudo with optional message', async () => {
            const resp = await TestUtils.Http
                .post(TestUtils.envURL('/kudos'))
                .set('Authorization', `Bearer ${eligibleUserToken}`)
                .send({ toUserId: regularUserId, category: KudoCategory.MENTORING, message: 'Great help!' });
            expect(resp).to.have.status(200);
            expect(resp.body.data.message).to.equal('Great help!');
        });

        it('self-kudo is blocked', async () => {
            const resp = await TestUtils.Http
                .post(TestUtils.envURL('/kudos'))
                .set('Authorization', `Bearer ${eligibleUserToken}`)
                .send({ toUserId: eligibleUserId, category: KudoCategory.TEAMWORK });
            expect(resp).to.have.status(400);
        });

        it('non-eligible user cannot give a kudo', async () => {
            const resp = await TestUtils.Http
                .post(TestUtils.envURL('/kudos'))
                .set('Authorization', `Bearer ${userToken}`)
                .send({ toUserId: adminUserId, category: KudoCategory.TEAMWORK });
            expect(resp).to.have.status(403);
        });

        it('invalid category returns 400', async () => {
            const resp = await TestUtils.Http
                .post(TestUtils.envURL('/kudos'))
                .set('Authorization', `Bearer ${eligibleUserToken}`)
                .send({ toUserId: regularUserId, category: 'INVALID_CATEGORY' });
            expect(resp).to.have.status(400);
        });

        it('invalid toUserId returns 400', async () => {
            const resp = await TestUtils.Http
                .post(TestUtils.envURL('/kudos'))
                .set('Authorization', `Bearer ${eligibleUserToken}`)
                .send({ toUserId: '000000000000000000000000', category: KudoCategory.TEAMWORK });
            expect(resp).to.have.status(400);
        });
    });

    describe('GET /kudos', () => {
        it('returns kudos sorted by newest first', async () => {
            const resp = await TestUtils.Http
                .get(TestUtils.envURL('/kudos'))
                .set('Authorization', `Bearer ${userToken}`)
                .send();
            expect(resp).to.have.status(200);
            const kudos = resp.body.data;
            expect(kudos).to.be.an('array');
            for (let i = 1; i < kudos.length; i++) {
                expect(kudos[i - 1].createdAt).to.be.gte(kudos[i].createdAt);
            }
        });

        it('filters by category', async () => {
            const resp = await TestUtils.Http
                .get(TestUtils.envURL(`/kudos?category=${KudoCategory.TEAMWORK}`))
                .set('Authorization', `Bearer ${userToken}`)
                .send();
            expect(resp).to.have.status(200);
            const kudos = resp.body.data;
            kudos.forEach((k: any) => expect(k.category).to.equal(KudoCategory.TEAMWORK));
        });

        it('filters by toUserId', async () => {
            const resp = await TestUtils.Http
                .get(TestUtils.envURL(`/kudos?toUserId=${regularUserId}`))
                .set('Authorization', `Bearer ${userToken}`)
                .send();
            expect(resp).to.have.status(200);
            const kudos = resp.body.data;
            kudos.forEach((k: any) => expect(k.toUserId).to.equal(regularUserId));
        });

        it('returns empty array when no kudos in date range', async () => {
            const resp = await TestUtils.Http
                .get(TestUtils.envURL('/kudos?startDate=2000-01-01&endDate=2000-01-31'))
                .set('Authorization', `Bearer ${userToken}`)
                .send();
            expect(resp).to.have.status(200);
            expect(resp.body.data).to.deep.equal([]);
        });
    });

    describe('DELETE /kudos/eligible-givers/:userId (admin only)', () => {
        it('admin can remove an eligible giver', async () => {
            const resp = await TestUtils.Http
                .delete(TestUtils.envURL(`/kudos/eligible-givers/${eligibleUserId}`))
                .set('Authorization', `Bearer ${adminToken}`)
                .send();
            expect(resp).to.have.status(200);
        });

        it('removing non-existent eligible giver returns 400', async () => {
            const resp = await TestUtils.Http
                .delete(TestUtils.envURL('/kudos/eligible-givers/nonexistent'))
                .set('Authorization', `Bearer ${adminToken}`)
                .send();
            expect(resp).to.have.status(400);
        });

        it('non-admin cannot remove an eligible giver', async () => {
            const resp = await TestUtils.Http
                .delete(TestUtils.envURL(`/kudos/eligible-givers/${eligibleUserId}`))
                .set('Authorization', `Bearer ${userToken}`)
                .send();
            expect(resp).to.have.status(403);
        });
    });
});
