import moment from "moment";
import { JIRAIssue } from "../jira";
import { GGSpreadsheets } from "../sheets";
import { JRGGSHandler } from "./define";
import { Catch } from "../../utils/decors";
import _ from "lodash";

export class TicketViewHandler extends JRGGSHandler {
    @Catch(console.log)
    async process(issues: JIRAIssue[], sheets: GGSpreadsheets): Promise<void> {
        const STATUS_COL = 3
        const DATE_ROW = 4
        const DATE_COL_START = 5
        const DATA_ROW = 6

        const now = moment()
        const today = now.format('DD/MM')

        const sheet = await sheets.getSheetServ('TicketView')
        if (!sheet) return

        const data = await sheets.getData('TicketView!A:X')
        const col = data[DATE_ROW].indexOf(today) + Number(now.hour() >= 12)

        let newRow = data.length
        const rowById = new Map(data.slice(DATA_ROW).map((row, index) => [row[0], index + DATA_ROW]))
        for (const issue of issues) {
            if (!rowById.has(issue.key)) {
                rowById.set(issue.key, newRow++)
                sheet.append([
                    sheet.mkCell(issue.key),
                    sheet.mkCell(issue.summary),
                    sheet.mkCell(issue.type),
                    sheet.mkCell(issue.abbrevStatus, { backgroundColor: issue.statusColor }),
                    sheet.mkCell(issue.storyPoint),
                    ..._.range(20).map(i => {
                        if (i + DATE_COL_START !== col) return sheet.mkCell('')
                        return sheet.mkCell(issue.assignee, { backgroundColor: issue.statusColor })
                    })
                ])
            }
            else {
                const rowIndex = rowById.get(issue.key)
                if (data[rowIndex][STATUS_COL] !== issue.status) {
                    sheet.updateCell(rowIndex, STATUS_COL, issue.status, { backgroundColor: issue.statusColor })
                }

                if (col >= DATE_COL_START && data[rowIndex][col] !== issue.abbrevAsignee) {
                    sheet.updateCell(rowIndex, col, issue.abbrevAsignee, { backgroundColor: issue.statusColor })
                }
            }
        }
        
        await sheet.batchUpdate()
    }
}