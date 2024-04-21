import { Body, DELETE, ExpressRouter, GET, POST, PUT, Params } from "express-router-ts";
import moment from "moment";
import { ObjectId } from "mongodb";
import HC from "../glob/hc";
import { Task } from "../models";
import { ITask } from "../models/task";
import { ValidBody } from "../utils/decors";
import { AppLogicError } from "../utils/hera";
import { execute } from "../serv/jrggs";

class TasksRouter extends ExpressRouter {
    document = {
        'tags': ['Tasks']
    }
    
    @GET({path: "/"})
    async getAvailableTasks() {
        const now = new Date()
        return await Task.find({ $and: [
            { begin: { $lte: now } }
        ]}).toArray()
    }
    
    @GET({path: "/current"})
    async getCurrentTasks() {
        const now = new Date()
        return await Task.findOne({ $and: [
            { begin: { $lte: now } },
            { end: { $gt: now } }
        ]}, { sort: { begin: -1 } })
    }
    
    @POST({path: "/"})
    @ValidBody({
        '+@sprint': 'string',
        '+@sprintId': 'string',
        '+@spreadsheetId': 'string',
        '+@begin': 'string',
        '+@end': 'string',
        '+[]@handlers': 'string',
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
        '[]@handlers': 'string',
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
    
    @DELETE({path: "/:id"})
    async deleteTask(@Params('id') id: string) {
        await Task.deleteOne({ _id: new ObjectId(id) })
        return HC.SUCCESS
    }
    
    @POST({path: "/exec"})
    @ValidBody({
        '+@sprintId': 'string',
        '+@spreadsheetId': 'string',
        '+[]@handlers': 'string',
        '++': false
    })
    async executeTask(@Body() task: Partial<ITask>) {
        await execute(task.sprintId, task.spreadsheetId, task.handlers)
        return HC.SUCCESS
    }
}

export default new TasksRouter()
