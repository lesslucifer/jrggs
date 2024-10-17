import { ExpressRouter, GET, Query } from "express-router-ts";
import moment from "moment";
import { Filter } from "mongodb";
import JiraIssue, { IJiraIssue, IJiraIssueMetrics } from "../models/jira-issue.mongo";
import { AppLogicError } from "../utils/hera";
import { JiraIssueData } from "../serv/jira";
import _ from "lodash";

class JiraIssueRouter extends ExpressRouter {
    document = {
        'tags': ['Jira Issues']
    }

    @GET({ path: "/metrics" })
    async getJiraIssueMetricsByDate(@Query() query: any): Promise<IMetricsOutput> {
        const queryObj = this.getIssuesQueryFromHttpQuery(query)
        const issues = await JiraIssue.find(queryObj).toArray()

        const output: IMetricsOutput = {
            filter: queryObj,
            issues: {},
            overall: {
                total: { storyPoints: 0, nRejections: 0, nDefects: 0, issues: [] },
                users: {}
            },
            byDate: []
        }
        const dateMetricsMap: Map<string, IMetricsRecord> = new Map()

        for (const issue of issues) {
            const metrics = issue.metrics || {
                storyPoints: {},
                nRejections: {},
                nDefects: {}
            }
            output.issues[issue.key] = metrics

            this.updateMetricsRecord(issue.key, metrics, output.overall)
            if (issue.completedAt) {
                const date = moment(issue.completedAt).format('YYYY-MM-DD')
                let dateMetrics = dateMetricsMap.get(date)
                if (!dateMetrics) {
                    dateMetrics = {
                        total: { storyPoints: 0, nRejections: 0, nDefects: 0, issues: [] },
                        users: {}
                    }
                    dateMetricsMap.set(date, dateMetrics)
                }

                this.updateMetricsRecord(issue.key, metrics, dateMetrics)
            }
        }

        output.byDate = _.sortBy(Array.from(dateMetricsMap.entries()).map(([date, metrics]) => ({ date, data: metrics })), 'date')

        return output
    }

    private updateMetricsRecord(key: string, metrics: IJiraIssueMetrics, record: IMetricsRecord) {
        // Update overall metrics
        record.total.storyPoints += metrics.storyPoints ? Object.values(metrics.storyPoints).reduce((a, b) => a + b, 0) : 0
        record.total.nRejections += metrics.nRejections ? Object.values(metrics.nRejections).reduce((a, b) => a + b, 0) : 0
        record.total.nDefects += metrics.nDefects ? Object.values(metrics.nDefects).reduce((a, b) => a + b.length, 0) : 0
        record.total.issues.push(key)

        const uids = new Set([...Object.keys(metrics.storyPoints), ...Object.keys(metrics.nRejections), ...Object.keys(metrics.nDefects)])
        // Update user metrics
        for (const uid of uids) {
            let userMetrics = record.users[uid]
            if (!userMetrics) {
                userMetrics = { storyPoints: 0, nRejections: 0, nDefects: 0, issues: [] }
                record.users[uid] = userMetrics
            }
            userMetrics.storyPoints += metrics.storyPoints?.[uid] || 0
            userMetrics.nRejections += metrics.nRejections?.[uid] || 0
            userMetrics.nDefects += metrics.nDefects?.[uid]?.length || 0
            userMetrics.issues.push(key)
        }
    }

    private getIssuesQueryFromHttpQuery(query: any) {
        const queryObj: Filter<IJiraIssue> = {}
        if (query.startDate && query.endDate) {
            const startDate = moment(query.startDate).startOf('day')
            const endDate = moment(query.endDate).endOf('day')
            if (!startDate.isValid() || !endDate.isValid()) {
                throw new AppLogicError('Invalid date format', 400);
            }

            const dateRange = endDate.diff(startDate, 'days')
            if (1 > dateRange || dateRange > 1000) {
                throw new AppLogicError('Date range must be between 1 and 1000 days', 400);
            }

            queryObj.completedAt = { $gte: startDate.valueOf(), $lte: endDate.valueOf() }
        }
        
        if (query.sprint) {
            queryObj['completedSprint.id'] = Number(query.sprint)
        }

        return queryObj
    }
}

export interface IMetricsDetails {
    storyPoints: number
    nRejections: number
    nDefects: number
    issues: string[]
}

export interface IMetricsRecord {
    total: IMetricsDetails
    users: Record<string, IMetricsDetails>
}

export interface IMetricsOutput {
    filter: Filter<IJiraIssue>
    issues: Record<string, IJiraIssueMetrics>
    overall: IMetricsRecord
    byDate: {
        date: string
        data: IMetricsRecord
    }[]
}

export default new JiraIssueRouter();
