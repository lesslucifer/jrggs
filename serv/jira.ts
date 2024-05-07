import axios from 'axios';
import ENV from '../glob/env';
import _ from 'lodash';

export class JIRAService {
    static async getIssues(sprint: string, startAt = 0) {
        const jql = Object.entries({
            'jql': `sprint = ${sprint}`,
            'maxResults': 100,
            'startAt': startAt
        }).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&')
        const url = `${ENV.JIRA_HOST}/rest/api/latest/search?${jql}`
        const resp = await axios.get(url, {
            headers: {
                'Authorization': ENV.JIRA_TOKEN
            }
        })

        const issues: JIRAIssue[] = (resp.data?.issues ?? []).map((iss: any) => new JIRAIssue(iss))
        if (issues.length && startAt + issues.length < resp.data.total) {
            const moreIssues = await this.getIssues(sprint, startAt + issues.length)
            issues.push(...moreIssues)
        }
        return issues
    }
}

export class JIRAIssue {
    constructor(public issue: any) { }

    get key(): string {
        return this.issue.key
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

  function hexToRgb(hex: string, alpha = 1) {
    var result = /^#?([a-fA-F\d]{2})([a-fA-F\d]{2})([a-fA-F\d]{2})$/i.exec(hex);
    return result ? {
      red: parseInt(result[1], 16) / 255,
      green: parseInt(result[2], 16) / 255,
      blue: parseInt(result[3], 16) / 255,
      alpha
    } : null;
  }