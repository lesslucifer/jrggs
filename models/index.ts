import { Collection, Db } from "mongodb";
import { ITask } from "./task";
import { IJiraIssueMetadata } from "./issue-metadata";

export let Task: Collection<ITask>
export let JiraIssueMetadata: Collection<IJiraIssueMetadata>

export async function initModels(db: Db) {
    Task = db.collection<ITask>('task')
    JiraIssueMetadata = db.collection<IJiraIssueMetadata>('issue-metadata')

    await migrate(db)
}

const MIGRATIONS = [initTasks, initJIM];

async function migrate(db: Db) {
    const dbConfig = await db.collection('config').findOne({ type: 'db' });
    const dbVersion = (dbConfig && dbConfig.version) || 0;
    for (let i = dbVersion; i < MIGRATIONS.length; ++i) {
        try {
            await MIGRATIONS[i](db);
            await db.collection('config').updateOne({ type: 'db' }, { $set: { version: i + 1 } }, { upsert: true });
        }
        catch (err) {
            console.log(err)
        }
    }
}

async function initTasks(db: Db) {
    Task.createIndex({ begin: 1 })
    Task.createIndex({ end: -1 })
    Task.createIndex({ sprint: 'hashed' })
    Task.createIndex({ sprintId: 'hashed' })
}

async function initJIM(db: Db) {
    JiraIssueMetadata.createIndex({ key: 'hashed' })
}