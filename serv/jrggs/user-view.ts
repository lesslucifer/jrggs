import moment from "moment";
import { JIRAIssue } from "../jira";
import { GGSpreadsheets } from "../sheets";
import { JRGGSHandler } from "./define";
import { Catch } from "../../utils/decors";
import _, { Dictionary } from "lodash";
import ENV from "../../glob/env";

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
        const rowsByTicketKey = _.chain(data.slice(DATA_ROW)).map((r, idx) => ({ k: r[1], v: idx + DATA_ROW })).groupBy('k').mapValues(rows => rows.map(r => r.v)).value()

        for (const issue of issues) {
            if (!rowById.has(issue.assigneeKey)) {
                rowById.set(issue.key, newRow++)
                sheet.append([
                    sheet.mkCell(issue.assignee),
                    sheet.mkCell({ formulaValue: `=HYPERLINK("${ENV.JIRA_HOST}browse/${issue.key}"; "${issue.key}")` }),
                    sheet.mkCell(issue.type),
                    sheet.mkCell(issue.status, { backgroundColor: issue.statusColor }),
                    sheet.mkCell(issue.storyPoint),
                    ..._.range(20).map(i => {
                        if (i + DATE_COL_START !== col) return sheet.mkCell('')
                        return sheet.mkCell(issue.abbrevStatus, { backgroundColor: issue.statusColor })
                    })
                ])
            }
            else {
                const rowIndex = rowById.get(issue.assigneeKey)
                if (data[rowIndex][STATUS_COL] !== issue.status) {
                    sheet.updateCell(rowIndex, STATUS_COL, issue.status, { backgroundColor: issue.statusColor })
                }

                if (col >= DATE_COL_START && data[rowIndex][col] !== issue.abbrevStatus) {
                    sheet.updateCell(rowIndex, col, issue.abbrevStatus, { backgroundColor: issue.statusColor })
                }
            }

            const rowIndex = rowById.get(issue.assigneeKey)
            const otherRows = rowsByTicketKey[issue.key] ?? []
            for (const r of otherRows) {
                if (rowIndex === r) continue
                if (col <= 0 || !data[r][col - 1] || data[r][col - 1].startsWith('→')) continue
                sheet.updateCell(r, col, `→${issue.abbrevAsignee}`, { backgroundColor: issue.statusColor })
            }
        }
        
        await sheet.batchUpdate()
    }
}