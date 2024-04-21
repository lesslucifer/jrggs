import { ENV_CONFIG } from './env';
import * as mongodb from 'mongodb';

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
    }
}

const CONN = new AppConnections();
export default CONN;
