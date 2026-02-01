import axios from 'axios';
import ENV from '../glob/env';
import _ from 'lodash';
import { IJiraIssueChangelogRecord } from '../models/jira-issue.mongo';
import { IJiraIssueComment } from '../models/jira-issue.mongo';

export class JIRAService {
    static async queryJiraIssues(jql: string) {
        const issues: JiraIssueData[] = [];
        let nextPageToken: string | undefined;
        let pageCount = 0;
        const MAX_PAGES = 1000;

        while (true) {
            pageCount++;
            if (pageCount > MAX_PAGES) {
                console.error(`[queryJiraIssues] Max pages reached for JQL: ${jql}`);
                break;
            }

            try {
                const body: Record<string, any> = {
                    jql: jql,
                    maxResults: 100
                };

                if (nextPageToken) {
                    body.nextPageToken = nextPageToken;
                }

                const url = `${ENV.JIRA_HOST}/rest/api/3/search/jql`;
                const resp = await axios.post(url, body, {
                    headers: {
                        'Authorization': ENV.JIRA_TOKEN,
                        'Content-Type': 'application/json'
                    },
                    timeout: 30000
                });

                const fetchedIssues: JiraIssueData[] = (resp.data?.issues ?? []).map((iss: any) => new JiraIssueData(iss));

                console.log(`[queryJiraIssues] Page ${pageCount}: fetched ${fetchedIssues.length} issues`);
                issues.push(...fetchedIssues);

                nextPageToken = resp.data?.nextPageToken;

                if (fetchedIssues.length === 0 || !nextPageToken) {
                    break;
                }
            } catch (error: any) {
                console.error(`[queryJiraIssues] Error on page ${pageCount}:`, error.message);
                throw error;
            }
        }

        console.log(`[queryJiraIssues] Total issues fetched: ${issues.length}`);
        return issues;
    }

    static getSprintIssues(sprint: string, lastUpdateTime: number = 0) {
        return this.queryJiraIssues(`sprint = ${sprint} AND updated > ${lastUpdateTime}`)
    }

    static getProjectIssues(projectKey: string, lastUpdateTime: number) {
        return this.queryJiraIssues(`project = ${projectKey} AND updated > ${lastUpdateTime}`)
    }

    static getSprintInfo(sprintId: number) {
        return axios.get(`${ENV.JIRA_HOST}/rest/agile/1.0/sprint/${sprintId}`, {
            headers: {
                'Authorization': ENV.JIRA_TOKEN
            }
        })
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

    static async getProjectSprints(projectKey: string): Promise<IJiraSprintInfo[]> {
        // First, get the board ID for the project
        const boardResp = await axios.get(`${ENV.JIRA_HOST}/rest/agile/1.0/board`, {
            params: {
                projectKeyOrId: projectKey,
                type: 'scrum'
            },
            headers: {
                'Authorization': ENV.JIRA_TOKEN,
                'Accept': 'application/json'
            }
        });
        
        if (!boardResp.data.values || boardResp.data.values.length === 0) {
            return []; // No board found for the project
        }

        const boardId = boardResp.data.values[0].id;

        // Now, get all sprints for this board
        let allSprints: IJiraSprintInfo[] = [];
        let startAt = 0;
        const maxResults = 50;

        while (true) {
            const sprintsResp = await axios.get(`${ENV.JIRA_HOST}/rest/agile/1.0/board/${boardId}/sprint`, {
                params: {
                    startAt: startAt,
                    maxResults: maxResults
                },
                headers: {
                    'Authorization': ENV.JIRA_TOKEN,
                    'Accept': 'application/json'
                }
            });

            const fetchedSprints = sprintsResp.data.values?.map((sprint: any) => ({
                ...sprint,
                projectKey: projectKey,
            })) ?? [];

            allSprints.push(...fetchedSprints);

            if (fetchedSprints.length < maxResults || !sprintsResp.data.isLast === false) {
                break;
            }

            startAt += fetchedSprints.length;
        }

        return allSprints;
    }

    static async getIssueChangelog(issueKey: string, startAt: number = 0): Promise<IJiraIssueChangelogRecord[]> {
        const url = `${ENV.JIRA_HOST}/rest/api/3/issue/${issueKey}/changelog`;
        const MAX_RESULTS = 100;
        let allChangelogs: any[] = [];
        let currentStartAt = startAt;
        
        while (true) {
            const resp = await axios.get(url, {
                params: {
                    startAt: currentStartAt,
                    maxResults: MAX_RESULTS
                },
                headers: {
                    'Authorization': ENV.JIRA_TOKEN
                }
            });
            
            const fetchedChangelogs = resp.data.values || [];
            if (fetchedChangelogs?.length > 0) {
                allChangelogs.push(...fetchedChangelogs);
            }
            
            // Check if we've fetched all changelogs
            if (fetchedChangelogs.length < MAX_RESULTS || !resp.data.isLast === false) {
                break;
            }
            
            currentStartAt += fetchedChangelogs.length;
        }
        
        return allChangelogs;
    }

    static async getIssueComments(issueKey: string, startAt: number = 0): Promise<IJiraIssueComment[]> {
        const url = `${ENV.JIRA_HOST}/rest/api/3/issue/${issueKey}/comment`;
        const MAX_RESULTS = 100;
        let allComments: any[] = [];
        let currentStartAt = startAt;
        
        while (true) {
            const resp = await axios.get(url, {
                params: {
                    startAt: currentStartAt,
                    maxResults: MAX_RESULTS
                },
                headers: {
                    'Authorization': ENV.JIRA_TOKEN
                }
            });
            
            const fetchedComments = resp.data.comments || [];
            if (fetchedComments?.length > 0) {
                allComments.push(...fetchedComments);
            }
            
            // Check if we've fetched all comments
            if (fetchedComments.length < MAX_RESULTS || !resp.data.isLast === false) {
                break;
            }
            
            currentStartAt += fetchedComments.length;
        }
        
        return allComments;
    }
}

export class JiraIssueData {
    constructor(public data: any) { }

    get key(): string {
        return this.data.key
    }

    get uri() {
        return `${ENV.JIRA_HOST}browse/${this.key}`
    }

    get summary(): string {
        return _.get(this.data, 'fields.summary')
    }

    get type(): string {
        return _.get(this.data, 'fields.issuetype.name')
    }

    get storyPoint(): number {
        return _.get(this.data, 'fields.customfield_10033') ?? 0
    }

    get sprints(): string {
        return _.chain(_.get(this.data, 'fields.customfield_10580', [])).sortBy(sp => sp.id ?? 0).map(sp => sp.name ?? 'Unknown sprint').join('\n').value()
    }

    get lastSprint(): { name: string, id: number } {
        return _.chain(_.get(this.data, 'fields.customfield_10580', [])).sortBy(sp => sp.id ?? 0).last().value()
    }

    get summaryWithSprint(): string {
        return [this.summary, this.sprints].join('\n')
    }

    get status(): string {
        return _.get(this.data, 'fields.status.name')
    }

    get lowerCaseStatus() {
        return this.status?.toLowerCase()
    }

    get assigneeId(): string {
        return _.get(this.data, 'fields.assignee.accountId') ?? ''
    }

    get assignee(): string {
        return _.get(this.data, 'fields.assignee.displayName') ?? ''
    }

    get lowerCaseAssignee() {
        return this.assignee?.toLowerCase()
    }

    get assigneeKey() {
        return `${this.assignee}:${this.key}`
    }

    get estSP() {
        return this.storyPoint * (STATUS_SP_EST[this.lowerCaseStatus] ?? 1)
    }

    get severity() {
        return _.get(this.data, 'fields.priority.name') ?? 'S3-Moderate'
    }
}

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
