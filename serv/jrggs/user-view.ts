import moment from "moment";
import { JIRAIssue } from "../jira";
import { GGSpreadsheets } from "../sheets";
import { JRGGSHandler } from "./define";
import { Catch } from "../../utils/decors";
import _ from "lodash";

export class UserViewHandler extends JRGGSHandler {
    @Catch(console.log)
    async process(issues: JIRAIssue[], sheets: GGSpreadsheets): Promise<void> {
        const STATUS_COL = 3
        const DATE_ROW = 4
        const DATE_COL_START = 5
        const DATA_ROW = 6

        const now = moment()
        const today = now.format('DD/MM')

        const sheet = await sheets.getSheetServ('UserView')
        if (!sheet) return

        const data = await sheets.getData('UserView!A:X')
        const col = data[DATE_ROW].indexOf(today) + Number(now.hour() >= 12)

        let newRow = data.length
        const rowById = new Map(data.slice(DATA_ROW).map((row, index) => [`${row[0]}:${row[1]}`, index + DATA_ROW]))
        for (const issue of issues) {
            if (!rowById.has(issue.assigneeKey)) {
                rowById.set(issue.key, newRow++)
                sheet.append([
                    sheet.mkCell(issue.assignee),
                    sheet.mkCell(issue.key),
                    sheet.mkCell(issue.type),
                    sheet.mkCell(issue.abbrevStatus, { backgroundColor: issue.statusColor }),
                    sheet.mkCell(issue.storyPoint),
                    ..._.range(20).map(i => {
                        if (i + DATE_COL_START !== col) return sheet.mkCell('')
                        return sheet.mkCell(issue.status, { backgroundColor: issue.statusColor })
                    })
                ])
            }
            else {
                const rowIndex = rowById.get(issue.assigneeKey)
                if (data[rowIndex][STATUS_COL] !== issue.status) {
                    sheet.updateCell(rowIndex, STATUS_COL, issue.status, { backgroundColor: issue.statusColor })
                }

                if (col >= DATE_COL_START && data[rowIndex][col] !== issue.status) {
                    sheet.updateCell(rowIndex, col, issue.status, { backgroundColor: issue.statusColor })
                }
            }
        }
        
        await sheet.batchUpdate()
    }
}