import { MongoModel } from "../utils/mongo-model"

export interface ITask {
    sprint: string
    sprintId: string
    spreadsheetId: string
    begin: Date
    end: Date
    handlers: string[]
}

const Task = MongoModel.createCollection<ITask>('task', {
    indexes: [
        { name: 'sprintId', index: { sprintId: 1 } },
        { name: 'begin', index: { begin: 1 } },
        { name: 'end', index: { end: -1 } },
        { name: 'sprint', index: { sprint: 'hashed' } }
    ],
});

export default Task;
