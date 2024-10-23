import JiraObject, { IJiraObject } from "../models/jira-object.mongo";
import schedule from "node-schedule";

export default class JiraObjectServ {
    private static lastRefreshTime = -1
    private static Cache = new Map<string, IJiraObject>()

    static async forceRefreshCache() {
        const objects = await JiraObject.find({}).toArray()
        const newCache = new Map<string, IJiraObject>(objects.map(obj => [obj.id, obj]))
        this.Cache = newCache
    }

    static async refreshCache() {
        const obj = await JiraObject.findOne({}, { sort: { _id: -1 }, projection: { _id: 1 } })
        const time = obj?.lastUpdatedAt
        if (time && time > this.lastRefreshTime) {
            await this.forceRefreshCache()
            this.lastRefreshTime = time
        }
    }

    static get(id: string): IJiraObject | undefined {
        return this.Cache.get(id)
    }
}

schedule.scheduleJob('0 * * * * *', async () => {
    await JiraObjectServ.refreshCache()
})