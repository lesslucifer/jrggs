import { ObjectId } from 'mongodb';
import { USER_ROLE } from '../../glob/cf';
import { IUser } from '../../models/user.mongo';
import { IUserAuth } from '../../models/user-auth.model';
import { IKudo, KudoCategory } from '../../models/kudo.mongo';
import { IKudoEligibleGiver } from '../../models/kudo-eligible-giver.mongo';

let seq = 0;
function nextSeq() { return ++seq; }

export function mockUser(overrides?: Partial<IUser>): IUser {
    const n = nextSeq();
    return {
        _id: new ObjectId(),
        name: `User ${n}`,
        email: `user${n}@test.com`,
        roles: [USER_ROLE.USER],
        isBlocked: false,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        ...overrides,
    };
}

export function mockAdmin(overrides?: Partial<IUser>): IUser {
    return mockUser({ roles: [USER_ROLE.ADMIN, USER_ROLE.USER], ...overrides });
}

export function mockKudo(overrides?: Partial<IKudo>): IKudo {
    const n = nextSeq();
    return {
        _id: new ObjectId(),
        fromUserId: new ObjectId().toHexString(),
        toUserId: new ObjectId().toHexString(),
        category: KudoCategory.TEAMWORK,
        message: `Kudo message ${n}`,
        createdAt: Date.now(),
        ...overrides,
    };
}

export function mockEligibleGiver(overrides?: Partial<IKudoEligibleGiver>): IKudoEligibleGiver {
    return {
        _id: new ObjectId(),
        userId: new ObjectId().toHexString(),
        addedBy: new ObjectId().toHexString(),
        addedAt: Date.now(),
        ...overrides,
    };
}

export function mockUserAuth(overrides?: Partial<IUserAuth>): IUserAuth {
    return {
        _id: new ObjectId(),
        user: new ObjectId(),
        passwordSHA1: 'a94a8fe5ccb19ba61c4c0873d391e987982fbbd3',
        passwordSalt: 'testsalt123',
        ...overrides,
    };
}
