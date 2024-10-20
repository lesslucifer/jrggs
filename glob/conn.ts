import { Sequelize } from 'sequelize-typescript';
import { MongoModel } from '../utils/mongo-model';
import { ENV_CONFIG } from './env';
import * as path from 'path';
import * as mongodb from 'mongodb';
import * as fs from 'fs-extra';
import Migration from '../models/sequelize-migration.seq';
import JiraIssueMetricsSeq from '../models/jira-issue-metrics.seq';
import JiraIssueSeq from '../models/jira-issue.seq';

// ************ CONFIGS ************
export class AppConnections {
    private mongo: mongodb.Db;
    private sequelize: Sequelize;
    get MONGO() { return this.mongo }
    get SEQUELIZE() { return this.sequelize }

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

        this.sequelize = new Sequelize(config.SEQUELIZE_CONNECTION, {
            models: [__dirname + '/models/*.seq.ts'],
            logging: false,
            dialectOptions: {
                multipleStatements: true
            }
        });
        this.sequelize.addModels([Migration, JiraIssueSeq, JiraIssueMetricsSeq])
        await this.migrate();
    }

    async migrate() {
        const scriptFolder = path.join(process.cwd(), 'sql_migration');
        const files = await fs.readdir(scriptFolder);
        const migratedScripts = new Set((await Migration.findAll({ attributes: ['name'] })).map(s => s.name));
        for (const file of files) {
            if (!file.endsWith('.sql')) continue;
            if (migratedScripts.has(file)) continue;

            const filePath = path.join(scriptFolder, file);
            const content = await fs.readFile(filePath, 'utf8');
            await this.sequelize.query(content, {
                raw: true
            })
            await Migration.create({ name: file, migratedAt: new Date() });
        }
    }
}

const CONN = new AppConnections();
export default CONN;
