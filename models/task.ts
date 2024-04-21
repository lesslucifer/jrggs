export interface ITask {
    sprint: string
    sprintId: string
    spreadsheetId: string
    begin: Date
    end: Date
    handlers: string[]
}