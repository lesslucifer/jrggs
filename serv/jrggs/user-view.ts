import _ from "lodash";
import moment from "moment";
import { AnyBulkWriteOperation } from "mongodb";
import JiraIssueMetadata, { IJiraIssueMetadata } from "../../models/issue-metadata";
import { Catch } from "../../utils/decors";
import { JiraIssueData, hexToRgb } from "../jira";
import { GGSpreadsheets } from "../sheets";
import { JRGGSHandler } from "./define";

export class UserViewHandler extends JRGGSHandler {
    @Catch(err => console.log(err))
    async process(issues: JiraIssueData[], sheets: GGSpreadsheets): Promise<void> {
        const ISSUE_KEY_COL = 1
        const ISSUE_TYPE_COL = 2
        const STATUS_COL = 3
        const SP_COL = 4
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
        const ticketKeys = Object.keys(rowsByTicketKey) ?? []

        const ticketMetas = await JiraIssueMetadata.find({ key: { $in: ticketKeys } }).toArray()
        const metaByTicketKey = _.keyBy(ticketMetas, t => t.key)
        const updatedMeta: AnyBulkWriteOperation<IJiraIssueMetadata>[] = []

        for (const issue of issues) {
            if (!rowById.has(issue.assigneeKey)) {
                rowById.set(issue.key, newRow++)
                sheet.append([
                    sheet.mkCell(issue.assignee),
                    sheet.mkCell(issue.key, { textFormat: { link: { uri: issue.uri } } }),
                    { ...sheet.mkCell(issue.type, { backgroundColor: issue.severityColor }), note: issue.summaryWithSprint },
                    sheet.mkCell(issue.status, { backgroundColor: issue.statusColor }),
                    sheet.mkCell(issue.storyPoint),
                    ..._.range(20).map(i => {
                        if (i + DATE_COL_START !== col) return sheet.mkCell('')
                        return sheet.mkCell(issue.abbrevStatus, { backgroundColor: issue.statusColor })
                    })
                ])
                updatedMeta.push({ updateOne: { filter: { key: issue.key }, update: { $set: { summaryWithSprints: issue.summaryWithSprint } }, upsert: true } })
            }
            else {
                const rowIndex = rowById.get(issue.assigneeKey)
                if (col >= DATE_COL_START && data[rowIndex][col] !== issue.abbrevStatus) {
                    sheet.updateCell(rowIndex, col, issue.abbrevStatus, { backgroundColor: issue.statusColor })
                }
            }

            const rowIndex = rowById.get(issue.assigneeKey)
            const otherRows = rowsByTicketKey[issue.key] ?? []
            for (const r of otherRows) {
                if (data[r][STATUS_COL] !== issue.status) {
                    sheet.updateCell(r, STATUS_COL, issue.status, { backgroundColor: issue.statusColor })
                }

                if (data[r][SP_COL] !== issue.storyPoint.toString()) {
                    sheet.updateCell(r, SP_COL, issue.storyPoint)
                }

                if (metaByTicketKey[issue.key]?.severity !== issue.severity || metaByTicketKey[issue.key]?.summaryWithSprints !== issue.summaryWithSprint) {
                    sheet.updateCellWithData(r, ISSUE_TYPE_COL, {
                        ...sheet.mkCell(issue.type, { backgroundColor: issue.severityColor }),
                        note: issue.summaryWithSprint
                    })

                    updatedMeta.push({ updateOne: { filter: { key: issue.key }, update: { $set: { severity: issue.severity, summaryWithSprints: issue.summaryWithSprint } }, upsert: true } })
                }

                if (rowIndex === r || col < DATE_COL_START) continue
                sheet.updateCell(r, col, `→${issue.abbrevAsignee}`, { backgroundColor: issue.statusColor, textFormat: { foregroundColor: hexToRgb("#666666") } })
            }
        }

        await sheet.batchUpdate()
        if (updatedMeta.length > 0) {
            await JiraIssueMetadata.bulkWrite(updatedMeta)
        }
    }
}