import sinon, { SinonSandbox } from 'sinon';
import { MongoModel } from '../../utils/mongo-model';

const NOOP_ASYNC = async () => null;
const NOOP_ARRAY = async () => [];

const FAKE_COLLECTION_METHODS = {
    findOne: NOOP_ASYNC,
    find: () => ({ toArray: NOOP_ARRAY }),
    insertOne: async () => ({ insertedId: null, acknowledged: true }),
    updateOne: async () => ({ matchedCount: 0, modifiedCount: 0, acknowledged: true, upsertedCount: 0, upsertedId: null }),
    deleteOne: async () => ({ deletedCount: 0, acknowledged: true }),
    deleteMany: async () => ({ deletedCount: 0, acknowledged: true }),
    bulkWrite: NOOP_ARRAY,
    aggregate: () => ({ toArray: NOOP_ARRAY }),
    findOneAndDelete: NOOP_ASYNC,
    findOneAndUpdate: NOOP_ASYNC,
    countDocuments: async () => 0,
    updateMany: async () => ({ matchedCount: 0, modifiedCount: 0, acknowledged: true, upsertedCount: 0, upsertedId: null }),
};

export function initMockCollections() {
    MongoModel.SKIP_INDEX_MANAGEMENT = true;
    const collections: MongoModel<any>[] = (MongoModel as any).collections;
    for (const model of collections) {
        (model as any)._collection = { ...FAKE_COLLECTION_METHODS };
    }
}

export function stubModel<T>(sandbox: SinonSandbox, model: any, method: string, returnValue: any) {
    const col = (model as any)._collection;
    if (method === 'find' || method === 'aggregate') {
        return sandbox.stub(col, method).returns({ toArray: sandbox.stub().resolves(returnValue) });
    }
    return sandbox.stub(col, method).resolves(returnValue);
}

export function stubAuth(sandbox: SinonSandbox, userOverrides?: Partial<any>) {
    const { mockUser } = require('./mock-factories');
    const user = mockUser(userOverrides);

    const AuthServ = require('../../serv/auth').AuthServ;
    const UserServ = require('../../serv/user').UserServ;

    sandbox.stub(AuthServ.authenticator, 'getUser').resolves({ id: user._id.toHexString(), scope: 'default' });
    sandbox.stub(UserServ, 'getUser').resolves(user);

    return user;
}

export function stubAxios(sandbox: SinonSandbox) {
    const axios = require('axios');
    return {
        get(returnValue: any) {
            return sandbox.stub(axios, 'get').resolves({ data: returnValue });
        },
        post(returnValue: any) {
            return sandbox.stub(axios, 'post').resolves({ data: returnValue });
        },
    };
}
