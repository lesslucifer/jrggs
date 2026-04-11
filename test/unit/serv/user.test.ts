import { describe, it, expect, beforeEach } from 'vitest';
import sinon from 'sinon';
import { ObjectId } from 'mongodb';
import { UserServ } from '../../../serv/user';
import User from '../../../models/user.mongo';
import UserAuth from '../../../models/user-auth.model';
import { USER_ROLE } from '../../../glob/cf';
import { mockUser, mockUserAuth } from '../../utils/mock-factories';
import { stubModel } from '../../utils/stub-helpers';

describe('UserServ', () => {
    let sandbox: sinon.SinonSandbox;

    beforeEach(() => {
        sandbox = (global as any).__sandbox;
    });

    describe('.getUser()', () => {
        it('should return a user when found', async () => {
            const user = mockUser();
            stubModel(sandbox, User, 'findOne', user);

            const result = await UserServ.getUser(user._id.toHexString());
            expect(result).toEqual(user);
        });

        it('should return null when user not found', async () => {
            stubModel(sandbox, User, 'findOne', null);

            const result = await UserServ.getUser(new ObjectId().toHexString());
            expect(result).toBeNull();
        });
    });

    describe('.hasRole()', () => {
        it('should return true when user has the role', () => {
            const user = mockUser({ roles: [USER_ROLE.ADMIN, USER_ROLE.USER] });
            expect(UserServ.hasRole(user, USER_ROLE.ADMIN)).toBe(true);
        });

        it('should return false when user lacks the role', () => {
            const user = mockUser({ roles: [USER_ROLE.USER] });
            expect(UserServ.hasRole(user, USER_ROLE.ADMIN)).toBe(false);
        });

        it('should return false for null user', () => {
            expect(UserServ.hasRole(null, USER_ROLE.USER)).toBe(false);
        });

        it('should return false for user with no roles', () => {
            const user = mockUser({ roles: undefined });
            expect(UserServ.hasRole(user, USER_ROLE.USER)).toBe(false);
        });
    });

    describe('.registerNewUser()', () => {
        it('should create a new user and return the inserted id', async () => {
            const insertedId = new ObjectId();
            stubModel(sandbox, User, 'findOne', null);
            stubModel(sandbox, User, 'insertOne', { insertedId, acknowledged: true });
            stubModel(sandbox, UserAuth, 'updateOne', { matchedCount: 1, modifiedCount: 1, acknowledged: true, upsertedCount: 0, upsertedId: null });

            const result = await UserServ.registerNewUser({
                name: 'New User',
                email: 'new@test.com',
                password: 'pass123',
                roles: [USER_ROLE.USER],
            });

            expect(result.toHexString()).toBe(insertedId.toHexString());
        });

        it('should throw when email is already registered', async () => {
            const existing = mockUser();
            stubModel(sandbox, User, 'findOne', existing);

            await expect(UserServ.registerNewUser({
                name: 'Dup User',
                email: existing.email,
                password: 'pass123',
                roles: [USER_ROLE.USER],
            })).rejects.toThrow('Email is already registered');
        });

        it('should throw on invalid email format', async () => {
            await expect(UserServ.registerNewUser({
                name: 'Bad Email',
                email: 'not-an-email',
                password: 'pass123',
                roles: [USER_ROLE.USER],
            })).rejects.toThrow('Invalid email');
        });
    });

    describe('.isValidPassword()', () => {
        it('should return true for correct password', async () => {
            const userId = new ObjectId();
            const salt = 'mysalt';
            const password = 'correctpass';
            const hash = UserServ.genSHA1(password, salt);
            const auth = mockUserAuth({ user: userId, passwordSHA1: hash, passwordSalt: salt });
            stubModel(sandbox, UserAuth, 'findOne', auth);

            const result = await UserServ.isValidPassword(userId, password);
            expect(result).toBe(true);
        });

        it('should return false for wrong password', async () => {
            const userId = new ObjectId();
            const auth = mockUserAuth({ user: userId, passwordSHA1: 'correcthash', passwordSalt: 'salt' });
            stubModel(sandbox, UserAuth, 'findOne', auth);

            const result = await UserServ.isValidPassword(userId, 'wrongpass');
            expect(result).toBe(false);
        });

        it('should return false when no auth record exists', async () => {
            stubModel(sandbox, UserAuth, 'findOne', null);

            const result = await UserServ.isValidPassword(new ObjectId(), 'anypass');
            expect(result).toBe(false);
        });
    });
});
