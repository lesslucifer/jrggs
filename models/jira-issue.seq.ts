import { AutoIncrement, Column, PrimaryKey, Table, Model } from "sequelize-typescript";

@Table({
    tableName: 'jira_issue',
    timestamps: false
})
export default class JiraIssueSeq extends Model<JiraIssueSeq> {
    @PrimaryKey
    @AutoIncrement
    @Column
    id: number

    @Column
    key: string

     @Column
     type: string

     @Column
     severity: string

     @Column
     completedSprint: number

     @Column
     completedAt?: Date
}