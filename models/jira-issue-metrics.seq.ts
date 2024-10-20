import { Column, Model, PrimaryKey, Table } from "sequelize-typescript";

@Table({
    tableName: 'jira_issue_metrics',
    timestamps: false,
})
export default class JiraIssueMetricsSeq extends Model<JiraIssueMetricsSeq> {
    @PrimaryKey
    @Column
    issueKey: string

    @PrimaryKey
    @Column
    userId: string

    @Column
    storyPoints: number

    @Column
    nRejections: number

    @Column
    nCodeReviews: number

    @Column
    nDefects: number
}