import { google, sheets_v4 } from "googleapis"
import fs from 'fs-extra'
import ENV from "../glob/env"
import _ from "lodash"

export class GGSpreadsheets {
    private _sheets: sheets_v4.Sheets
    private metadata: sheets_v4.Schema$Spreadsheet

    constructor(public spreadsheetId: string) {

    }

    async getKey() {
        return JSON.parse((await fs.readFile(ENV.GG_KEY_FILE)).toString('utf-8'))
    }

    async getJWTAuth() {
        const key = await this.getKey()
        const jwt = new google.auth.JWT({
            email: key.client_email,
            key: key.private_key,
            scopes: ['https://www.googleapis.com/auth/spreadsheets'],
        })
        await jwt.authorize()

        return jwt
    }

    async getSheets() {
        if (!this._sheets) {
            this._sheets = google.sheets({ version: 'v4', auth: await this.getJWTAuth() })
        }
        return this._sheets
    }

    async getMetadata() {
        if (!this.metadata) {
            const sheets = await this.getSheets()
            const resp = await sheets.spreadsheets.get({
                spreadsheetId: this.spreadsheetId,
                includeGridData: false
            });
            this.metadata = resp.data
        }

        return this.metadata
    }

    async getSheetId(sheetName: string) {
        const metadata = await this.getMetadata()
        return metadata.sheets?.find(sheet => sheet.properties?.title === sheetName)?.properties?.sheetId
    }

    async getSheetServ(sheetName: string) {
        const sheetId = await this.getSheetId(sheetName)
        if (sheetId === null || sheetId === undefined || sheetId < 0) return
        return new SheetServ(this, sheetName, sheetId)
    }

    async getData(range: string) {
        const sheets = await this.getSheets()
        const resp = await sheets.spreadsheets.values.get({
            spreadsheetId: this.spreadsheetId,
            range
        });
        return resp.data.values ?? []
    }

    async batchUpdate(requests: sheets_v4.Schema$Request[]) {
        const sheets = await this.getSheets()
        return await sheets.spreadsheets.batchUpdate({
            spreadsheetId: this.spreadsheetId,
            requestBody: {
                requests: requests
            },
        });
    }
}

export class SheetServ {
    private requests: sheets_v4.Schema$Request[] = []

    constructor(private spreadsheets: GGSpreadsheets, public name: string, public sheetId: number) { }

    append(...rows: sheets_v4.Schema$CellData[][]): sheets_v4.Schema$Request {
        const request = {
            appendCells: {
                sheetId: this.sheetId,
                rows: rows.map(row => ({
                    values: row
                })),
                fields: 'userEnteredValue,userEnteredFormat'
            }
        }
        this.requests.push(request)
        return request
    }

    updateCell(row: number, col: number, value: string | number, format?: sheets_v4.Schema$CellFormat): sheets_v4.Schema$Request {
        const req = {
            updateCells: {
                range: {
                    sheetId: this.sheetId,
                    startColumnIndex: row,
                    endRowIndex: row + 1,
                    startRowIndex: col,
                    endColumnIndex: col + 1
                },
                rows: [{ values: [this.mkCell(value, format)] }],
                fields: 'userEnteredValue,userEnteredFormat'
            }
        }
        this.requests.push(req)
        return req
    }

    mkCell(value: string | number, format?: sheets_v4.Schema$CellFormat): sheets_v4.Schema$CellData {
        return Object.assign({
            userEnteredValue: _.isString(value) ? { stringValue: value } : { numberValue: value }
        }, format && {
            userEnteredFormat: format
        })
    }

    async batchUpdate() {
        if (!this.requests.length) return

        const reqs = this.requests
        this.requests = []
        return await this.spreadsheets.batchUpdate(reqs)
    }
}