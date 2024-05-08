import { Task } from "../../models";
import { Catch } from "../../utils/decors";
import { JIRAService } from "../jira";
import { GGSpreadsheets } from "../sheets";
import { JRGGSHandler } from "./define";
import { EstSPHandler } from "./est-sp";
import { TicketViewHandler } from "./ticket-view";
import { UserViewHandler } from "./user-view";
import schedule from 'node-schedule'

export function getJRGGSHandler(handlerName: string): JRGGSHandler {
    if (handlerName === 'TicketView') { return new TicketViewHandler() }
    if (handlerName === 'UserView') { return new UserViewHandler() }
    if (handlerName === 'EstSP') { return new EstSPHandler() }
    return null    
}

export async function execute(sprintId: string, spreadsheetId: string, handlers: string[]) {
    const issues = await JIRAService.getIssues(sprintId)
    const sheets = new GGSpreadsheets(spreadsheetId)
    
    for (const h of handlers) {
        const handler = getJRGGSHandler(h)
        if (!handler) continue

        const result = await handler.process(issues, sheets)
    }
}

export async function runCurrentTask() {
    const now = new Date()
    console.log('runCurrentTask at', now)
    const task = await Task.findOne({ $and: [
        { begin: { $lte: now } },
        { end: { $gt: now } }
    ]}, { sort: { begin: -1 } })
    if (!task) return

    await execute(task.sprintId, task.spreadsheetId, task.handlers)
    console.log('runCurrentTask', task._id, 'at', now)
}

schedule.scheduleJob('0 15 10 * * *', () => runCurrentTask().catch((err) => console.error(err)));
schedule.scheduleJob('0 15 14 * * *', () => runCurrentTask().catch((err) => console.error(err)));