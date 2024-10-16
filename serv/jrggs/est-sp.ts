import { Catch } from "../../utils/decors";
import { JiraIssueData } from "../jira";
import { GGSpreadsheets } from "../sheets";
import { JRGGSHandler } from "./define";

export class EstSPHandler extends JRGGSHandler {
    @Catch(err => console.log('Est SP err', err))
    async process(issues: JiraIssueData[], sheets: GGSpreadsheets): Promise<void> {
        const STATUS_COL = 3
        const SP_COL = 4
        const DATA_ROW = 6
        const EST_SP_COL = 25

        const sheet = await sheets.getSheetServ('TicketView')
        if (!sheet) return

        const data = await sheets.getData('TicketView!A:X')

        const rowById = new Map(data.slice(DATA_ROW).map((row, index) => [row[0], index + DATA_ROW]))

        for (const issue of issues) {
            if (!rowById.has(issue.key)) continue

            const rowIndex = rowById.get(issue.key)
            if (data[rowIndex][STATUS_COL] !== issue.status) {
                sheet.updateCell(rowIndex, STATUS_COL, issue.status, { backgroundColor: issue.statusColor })
            }

            if (data[rowIndex][SP_COL] !== issue.storyPoint.toString()) {
                sheet.updateCell(rowIndex, SP_COL, issue.storyPoint)
            }

            const estSP = issue.estSP.toFixed(2)
            if (data[rowIndex][EST_SP_COL] !== estSP) {
                sheet.updateCell(rowIndex, EST_SP_COL, Number(estSP))
            }
        }
        
        await sheet.batchUpdate()
    }
}