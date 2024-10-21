import * as mongodb from 'mongodb';
import { MongoModel } from '../utils/mongo-model';
import { ENV_CONFIG } from './env';

// ************ CONFIGS ************
export class AppConnections {
    private mongo: mongodb.Db;
    get MONGO() { return this.mongo }

    constructor() {

    }

    async configureConnections(config: ENV_CONFIG) {
        const mongoConn = new mongodb.MongoClient(config.MONGO_CONNECTION, {
            useUnifiedTopology: true,
            ...config.MONGO_OPTIONS
        });
        await mongoConn.connect()
        this.mongo = mongoConn.db(config.MONGO_DB)
        await MongoModel.setDatabase(this.mongo)
    }
}

const CONN = new AppConnections();
export default CONN;
