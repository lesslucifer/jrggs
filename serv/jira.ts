import axios from 'axios';
import ENV from '../glob/env';
import _ from 'lodash';

export class JIRAService {
    static async queryJiraIssues(jql: string) {
        const issues: JIRAIssue[] = [];
        let totalIssues = 0;
        let startAt = 0;

        while (true) {
            const query = Object.entries({
                'jql': jql,
                'maxResults': 100,
                'startAt': startAt
            }).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
            const url = `${ENV.JIRA_HOST}/rest/api/latest/search?${query}`;
            const resp = await axios.get(url, {
                headers: {
                    'Authorization': ENV.JIRA_TOKEN
                }
            });

            const fetchedIssues: JIRAIssue[] = (resp.data?.issues ?? []).map((iss: any) => new JIRAIssue(iss));
            issues.push(...fetchedIssues);
            totalIssues = resp.data.total;

            if (fetchedIssues.length === 0 || startAt + fetchedIssues.length >= totalIssues) {
                break;
            }

            startAt += fetchedIssues.length;
        }

        return issues;
    }

    static getSprintIssues(sprint: string, lastUpdateTime: number = 0) {
        return this.queryJiraIssues(`sprint = ${sprint} AND updated > ${lastUpdateTime}`)
    }

    static getIssues(lastUpdateTime: number) {
        return this.queryJiraIssues(`updated > ${lastUpdateTime}`)
    }

    static async getActiveSprints(projectKey: string): Promise<IJiraSprintInfo[]> {
        const resp = await axios.get(`${ENV.JIRA_HOST}/rest/agile/1.0/board`, {
            params: {
                projectKeyOrId: projectKey,
                type: 'scrum'
            },
            headers: {
                'Authorization': ENV.JIRA_TOKEN,
                'Accept': 'application/json'
            }
        });
        
        if (resp.data.values && resp.data.values.length > 0) {
            const boardId = resp.data.values[0].id;
            const sprintsResp = await axios.get(`${ENV.JIRA_HOST}/rest/agile/1.0/board/${boardId}/sprint`, {
                params: {
                    state: 'active'
                },
                headers: {
                    'Authorization': ENV.JIRA_TOKEN,
                    'Accept': 'application/json'
                }
            });
            return sprintsResp.data.values?.map((sprint: any) => ({
                ...sprint,
                projectKey: projectKey,
            })) ?? [];
        }
        
        return [];
    }
}

export class JIRAIssue {
    constructor(public issue: any) { }

    get key(): string {
        return this.issue.key
    }

    get uri() {
        return `${ENV.JIRA_HOST}browse/${this.key}`
    }

    get summary(): string {
        return _.get(this.issue, 'fields.summary')
    }

    get type(): string {
        return _.get(this.issue, 'fields.issuetype.name')
    }

    get storyPoint(): number {
        return _.get(this.issue, 'fields.customfield_10033') ?? 0
    }

    get sprints(): string {
        return _.chain(_.get(this.issue, 'fields.customfield_10580', [])).sortBy(sp => sp.id ?? 0).map(sp => sp.name ?? 'Unknown sprint').join('\n').value()
    }

    get summaryWithSprint(): string {
        return [this.summary, this.sprints].join('\n')
    }

    get status(): string {
        return _.get(this.issue, 'fields.status.name')
    }

    get lowerCaseStatus() {
        return this.status?.toLowerCase()
    }

    get abbrevStatus() {
        return STATUS_ABBREV[this.lowerCaseStatus] ?? this.status
    }

    get statusColor() {
        return COLOR_BY_STATUS[this.lowerCaseStatus] ?? COLOR_BY_STATUS.default
    }

    get assignee(): string {
        return _.get(this.issue, 'fields.assignee.displayName') ?? ''
    }

    get lowerCaseAssignee() {
        return this.assignee?.toLowerCase()
    }

    get abbrevAsignee() {
        return USER_ABBREV[this.lowerCaseAssignee] ?? this.assignee
    }

    get assigneeKey() {
        return `${this.assignee}:${this.key}`
    }

    get estSP() {
        return this.storyPoint * (STATUS_SP_EST[this.lowerCaseStatus] ?? 1)
    }

    get severity() {
        return _.get(this.issue, 'fields.priority.name') ?? 'S3-Moderate'
    }

    get severityColor() {
        return SEVERITY_COLOR[this.severity.toLowerCase()] ?? hexToRgb('#ffffff')
    }
}

const STATUS_ABBREV = _.mapKeys({
    'To Do': 'TODO',
    'Waiting': 'WAIT',
    'Ready': 'RD',
    'Rejected': 'REJ',
    'In Progress': 'IN-PR',
    'BE - In Progress': 'BE-IP',
    'FE - In Progress': 'FE-IP',
    'Code Review': 'CR',
    'BE - Code Review': 'BE-CR',
    'FE - Code Review': 'FE-CR',
    'READY FOR DEPLOYMENT': 'RFD',
    'Ready for QA': 'RQA',
    'Test In Progress': 'TIP',
    'Ready to Merge': 'RTM',
    'Merged': 'MRD',
    'PO review': 'POR',
    'Closed': 'CLSD',
    'Done': 'DONE'
}, (v, k) => k.toLowerCase())

const STATUS_SP_EST = _.mapKeys({
    'To Do': 1,
    'Waiting': 1,
    'Ready': 1,
    'Rejected': 0.4,
    'In Progress': 0.8,
    'BE - In Progress': 0.8,
    'FE - In Progress': 0.5,
    'Code Review': 0.6,
    'BE - Code Review': 0.6,
    'FE - Code Review': 0.4,
    'READY FOR DEPLOYMENT': 0.4,
    'Ready for QA': 0.3,
    'Test In Progress': 0.3,
    'Ready to Merge': 0.1,
    'Merged': 0.1,
    'PO review': 0.1,
    'Closed': 0,
    'Done': 0
}, (v, k) => k.toLowerCase())

const COLOR_BY_STATUS = _.mapValues(_.mapKeys({
    'To Do': '#DDDDDD',
    'Waiting': '#DDDDDD',
    'Ready': '#DDDDDD',
    'Rejected': '#DD5746',
    'In Progress': '#008DDA',
    'BE - In Progress': '#008DDA',
    'FE - In Progress': '#008DDA',
    'Code Review': '#FFAF45',
    'BE - Code Review': '#FFAF45',
    'FE - Code Review': '#FFAF45',
    'READY FOR DEPLOYMENT': '#E1AFD1',
    'Ready for QA': '#AD88C6',
    'Test In Progress': '#7469B6',
    'Ready to Merge': '#37B5B6',
    'Merged': '#3652AD',
    'PO review': '#3652AD',
    'Closed': '#0D9276',
    'Done': '#0D9276',
    'Default': '#FFBE98'
}, (v, k) => k.toLowerCase()), v => hexToRgb(v, 0))

const USER_ABBREV = _.mapKeys({
    'VU LUU': 'VU',
    'Myla Ross Enerio': 'MYLA',
    'Ariel Cuerdo': 'ARIEL',
    'Patrick Roi Ocampo': 'PO',
    'Joseph Serrano': 'JS',
    'An Dang': 'AN',
    'Tan Le': 'TAN',
    'Joan Chongco': 'JOAN',
    'Hervin Deniega': 'HERVIN',
    'Duc Nguyen': 'DUC',
    'Anh Tran': 'ANH',
    'Tien Nguyen': 'TIEN',
    'Patryk Wojcieszak': 'PW',
    'Sebastian Dębicki': 'SEB',
    'Hung Tran': 'HARV',
    'Erika Deloria': 'EKD',
    'Erika Magpantay': 'EKM',
    'Anthony Sedrey Tolentino': 'SED',
    'Mark Anthony Razonable': 'MARK',
    'John Patrick Rabaja': 'JP',
    'Jamie Anne Ferrera': 'JAMIE',
    'Jophell Ericson Vergara': 'JOPH',
    'Shiena Nebiar': 'SHIENA',
    'Renz Joal A. Borais': 'RENZ',
    'Duong Hoang': 'RIN'
}, (v, k) => k.toLowerCase())

const SEVERITY_COLOR = _.mapValues(_.mapKeys({
    'S1-Critical': '#ea9999',
    'S2-Severe': '#f9cb9c',
    'S3-Moderate': '#ffffff'
}, (v, k) => k.toLowerCase()), v => hexToRgb(v, 0))

export function hexToRgb(hex: string, alpha = 1) {
    var result = /^#?([a-fA-F\d]{2})([a-fA-F\d]{2})([a-fA-F\d]{2})$/i.exec(hex);
    return result ? {
        red: parseInt(result[1], 16) / 255,
        green: parseInt(result[2], 16) / 255,
        blue: parseInt(result[3], 16) / 255,
        alpha
    } : null;
}

export interface IJiraSprintInfo {
    id: number;
    projectKey: string;
    self: string;
    state: string;
    name: string;
    startDate: string;
    endDate: string;
    createdDate: string;
    originBoardId?: number;
    goal?: string;
}