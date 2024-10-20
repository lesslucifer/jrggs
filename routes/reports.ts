import { ExpressRouter, GET, Query } from "express-router-ts";
import _ from "lodash";
import moment from "moment";
import { Filter } from "mongodb";
import JiraIssue, { IJiraIssue, IJiraIssueMetrics } from "../models/jira-issue.mongo";
import { AppLogicError } from "../utils/hera";
import { JiraIssueData } from "../serv/jira";

class JiraIssueRouter extends ExpressRouter {
    document = {
        'tags': ['Reports']
    }

    @GET({ path: '/overall'})
    async getOverallReport(@Query() query: any): Promise<IJiraIssueReportRecord[]> {
        const queryObj = this.getIssuesQueryFromHttpQuery(query, ['sprint'])
        const issues = await JiraIssue.find(queryObj).toArray()
        return issues.map(iss => {
            const data = new JiraIssueData(iss.data)
            const record: IJiraIssueReportRecord = {
                sprintId: iss.completedSprint?.id,
                key: iss.key,
                type: data.type,
                severity: data.severity,
                metrics: Object.values(iss.metrics).reduce((metrics, userMetrics) => {
                    metrics.storyPoints += userMetrics.storyPoints
                    metrics.nRejections += userMetrics.nRejections
                    metrics.defects.push(...userMetrics.defects)
                    metrics.nCodeReviews += userMetrics.nCodeReviews
                    return metrics
                }, {
                    storyPoints: 0,
                    nRejections: 0,
                    defects: [],
                    nCodeReviews: 0,
                } as IJiraIssueMetrics)
            }
            record.metrics.defects = _.uniq(record.metrics.defects)
            return record
        })
    }

    private getIssuesQueryFromHttpQuery(query: any, allowedQuery: string[]) {
        const queryObj: Filter<IJiraIssue> = {
            'data.fields.issuetype.name': { $ne: 'Sub-task' }
        }
        if (allowedQuery.includes('date') && query.startDate && query.endDate) {
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
        
        if (allowedQuery.includes('sprint') && query.sprint) {
            queryObj['completedSprint.id'] = { $in: query.sprint.split(',').map(Number) }
        }

        return queryObj
    }
}

export type IJiraIssueReportRecord = {
    sprintId: number
    key: string
    type: string
    severity: string
    metrics: IJiraIssueMetrics
}

export default new JiraIssueRouter();