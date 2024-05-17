import moment from "moment";
import { JIRAIssue } from "../jira";
import { GGSpreadsheets } from "../sheets";
import { JRGGSHandler } from "./define";
import { Catch } from "../../utils/decors";
import _ from "lodash";
import ENV from "../../glob/env";
import { JiraIssueMetadata } from "../../models";
import { AnyBulkWriteOperation } from "mongodb";
import { IJiraIssueMetadata } from "../../models/issue-metadata";

export class TicketViewHandler extends JRGGSHandler {
    @Catch(err => console.log('TicketViewHandler err', err))
    async process(issues: JIRAIssue[], sheets: GGSpreadsheets): Promise<void> {
        const SUMMARY_COL = 1
        const ISSUE_TYPE_COL = 2
        const STATUS_COL = 3
        const SP_COL = 4
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
        const ticketKeys = [...rowById.keys()]

        const ticketMetas = await JiraIssueMetadata.find({ key: {$in: ticketKeys} }).toArray()
        const metaByTicketKey = _.keyBy(ticketMetas, t => t.key)
        const updatedMeta: AnyBulkWriteOperation<IJiraIssueMetadata>[] = []

        for (const issue of issues) {
            if (!rowById.has(issue.key)) {
                rowById.set(issue.key, newRow++)
                sheet.append([
                    sheet.mkCell(issue.key, { textFormat: { link: { uri: issue.uri } } }),
                    { ...sheet.mkCell(issue.summary), note: issue.sprints },
                    sheet.mkCell(issue.type, { backgroundColor: issue.severityColor }),
                    sheet.mkCell(issue.status, { backgroundColor: issue.statusColor }),
                    sheet.mkCell(issue.storyPoint),
                    ..._.range(20).map(i => {
                        if (i + DATE_COL_START !== col) return sheet.mkCell('')
                        return sheet.mkCell(issue.abbrevAsignee, { backgroundColor: issue.statusColor })
                    })
                ])
                updatedMeta.push({ updateOne: { filter: { key: issue.key }, update: { $set: { sprints: issue.sprints } }, upsert: true } })
            }
            else {
                const rowIndex = rowById.get(issue.key)
                if (data[rowIndex][STATUS_COL] !== issue.status) {
                    sheet.updateCell(rowIndex, STATUS_COL, issue.status, { backgroundColor: issue.statusColor })
                }

                if (col >= DATE_COL_START && data[rowIndex][col] !== issue.abbrevAsignee) {
                    sheet.updateCell(rowIndex, col, issue.abbrevAsignee, { backgroundColor: issue.statusColor })
                }

                if (metaByTicketKey[issue.key]?.sprints !== issue.sprints) {
                    sheet.updateCellWithData(rowIndex, SUMMARY_COL, { ...sheet.mkCell(issue.summary), note: issue.sprints })
                    updatedMeta.push({ updateOne: { filter: { key: issue.key }, update: { $set: { sprints: issue.sprints } }, upsert: true } })
                }

                if (metaByTicketKey[issue.key]?.severity !== issue.severity) {
                    sheet.updateCell(rowIndex, ISSUE_TYPE_COL, issue.type, { backgroundColor: issue.severityColor })
                    updatedMeta.push({ updateOne: { filter: { key: issue.key }, update: { $set: { severity: issue.severity } }, upsert: true } })
                }

                if (data[rowIndex][SP_COL] !== issue.storyPoint.toString()) {
                    sheet.updateCell(rowIndex, SP_COL, issue.storyPoint)
                }
            }
        }
        
        await sheet.batchUpdate()
    }
}