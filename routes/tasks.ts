import { Body, ExpressRouter, GET, POST, PUT, Params } from "express-router-ts";
import moment from "moment";
import { ObjectId } from "mongodb";
import HC from "../glob/hc";
import { Task } from "../models";
import { ITask } from "../models/task";
import { ValidBody } from "../utils/decors";
import { AppLogicError } from "../utils/hera";

class TasksRouter extends ExpressRouter {
    document = {
        'tags': ['Tasks']
    }
    
    @GET({path: "/"})
    async getAvailableTasks() {
        const now = new Date()
        return await Task.find({ $and: [
            { begin: { $gte: now } }
        ]}).toArray()
    }
    
    @GET({path: "/current"})
    async getCurrentTasks() {
        const now = new Date()
        return await Task.findOne({ $and: [
            { begin: { $gte: now } },
            { end: { $lt: now } }
        ]}, { sort: { begin: -1 } })
    }
    
    @POST({path: "/"})
    @ValidBody({
        '+@sprint': 'string',
        '+@sprintId': 'string',
        '+@spreadsheetId': 'string',
        '+@begin': 'string',
        '+@end': 'string',
        '++': false
    })
    async addTask(@Body() task: ITask) {
        const begin = moment(task.begin)
        if (!begin.isValid()) throw new AppLogicError(`Invalid begin date format`)
        task.begin = begin.toDate()

        const end = moment(task.end)
        if (!end.isValid()) throw new AppLogicError(`Invalid end date format`)
        task.end = end.toDate()
        
        const res = await Task.insertOne(task)
        return { _id: res.insertedId }
    }
    
    @PUT({path: "/:id"})
    @ValidBody({
        '@sprint': 'string',
        '@sprintId': 'string',
        '@spreadsheetId': 'string',
        '@begin': 'string',
        '@end': 'string',
        '++': false
    })
    async updateTask(@Params('id') id: string, @Body() task: Partial<ITask>) {
        const _id = new ObjectId(id)
        if (task.begin) {
            const begin = moment(task.begin)
            if (!begin.isValid()) throw new AppLogicError(`Invalid begin date format`)
            task.begin = begin.toDate()
        }

        if (task.end) {
            const end = moment(task.end)
            if (!end.isValid()) throw new AppLogicError(`Invalid end date format`)
            task.end = end.toDate()
        }
        
        await Task.updateOne({ _id }, { $set: task })
        return HC.SUCCESS
    }
}

export default new TasksRouter()
