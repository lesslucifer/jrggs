import { ExpressRouter, GET, Query } from "express-router-ts";
import _ from "lodash";
import moment from "moment";
import { Filter } from "mongodb";
import JiraIssue, { IJiraIssue, IJiraIssueMetrics } from "../models/jira-issue.mongo";
import { AppLogicError } from "../utils/hera";

class JiraIssueRouter extends ExpressRouter {
    document = {
        'tags': ['Jira Issues']
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
