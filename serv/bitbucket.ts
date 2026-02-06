import axios from 'axios';
import ENV from '../glob/env';
import { IBitbucketPRData } from '../models/bitbucket-pr.mongo';
import moment from 'moment';

export class BitbucketService {
    static async queryPullRequests(workspace: string, repoSlug: string, lastUpdatedTime: number = 0, maxPRs: number = 1000) {
        const prs: IBitbucketPRData[] = [];
        let nextPageUrl: string | undefined;
        let pageCount = 0;
        const MAX_PAGES = 100;

        while (true) {
            pageCount++;
            if (pageCount > MAX_PAGES) {
                console.error(`[queryPullRequests] Max pages reached for ${workspace}/${repoSlug}`);
                break;
            }

            if (prs.length >= maxPRs) {
                break;
            }

            try {
                console.log("[queryPullRequests] lastUpdatedTime", moment(lastUpdatedTime).toISOString())
                const url = nextPageUrl || `${ENV.BITBUCKET_API_BASE}/repositories/${workspace}/${repoSlug}/pullrequests`;
                const params = nextPageUrl ? {} : {
                    state: 'ALL',
                    sort: 'updated_on',
                    q: `updated_on > "${moment(lastUpdatedTime).toISOString()}"`,
                    pagelen: 50
                };

                const resp = await axios.get(url, {
                    params,
                    auth: {
                        username: ENV.BITBUCKET_USERNAME,
                        password: ENV.BITBUCKET_API_TOKEN
                    },
                    headers: {
                        'Accept': 'application/json'
                    },
                    timeout: 30000
                });

                const fetchedPRs: IBitbucketPRData[] = resp.data?.values ?? [];

                console.log(`[queryPullRequests] Page ${pageCount}: fetched ${fetchedPRs.length} PRs`);

                // Filter by lastUpdatedTime
                const filteredPRs = fetchedPRs.filter(pr => {
                    const updatedAt = new Date(pr.updated_on).getTime();
                    return updatedAt > lastUpdatedTime;
                });

                if (filteredPRs.length === 0) {
                    console.log(`[queryPullRequests] No more PRs updated after ${new Date(lastUpdatedTime).toISOString()}`);
                    break;
                }

                const remainingSlots = maxPRs - prs.length;
                prs.push(...filteredPRs.slice(0, remainingSlots));

                nextPageUrl = resp.data?.next;

                if (!nextPageUrl || filteredPRs.length < fetchedPRs.length) {
                    break;
                }
            } catch (error: any) {
                console.error(`[queryPullRequests] Error on page ${pageCount}:`, error.message);
                throw error;
            }
        }

        console.log(`[queryPullRequests] Total PRs fetched: ${prs.length}`);
        return prs;
    }

    static async getPRActivity(workspace: string, repoSlug: string, prId: number): Promise<any[]> {
        const activities: any[] = [];
        let nextPageUrl: string | undefined;
        let pageCount = 0;
        const MAX_PAGES = 50;

        try {
            while (true) {
                pageCount++;
                if (pageCount > MAX_PAGES) {
                    console.warn(`[getPRActivity] Max pages reached for PR ${prId}`);
                    break;
                }

                const url = nextPageUrl || `${ENV.BITBUCKET_API_BASE}/repositories/${workspace}/${repoSlug}/pullrequests/${prId}/activity`;

                const resp = await axios.get(url, {
                    auth: {
                        username: ENV.BITBUCKET_USERNAME,
                        password: ENV.BITBUCKET_API_TOKEN
                    },
                    headers: {
                        'Accept': 'application/json'
                    },
                    timeout: 30000
                });

                const fetchedActivities: any[] = resp.data?.values ?? [];
                activities.push(...fetchedActivities);

                nextPageUrl = resp.data?.next;
                if (!nextPageUrl || fetchedActivities.length === 0) {
                    break;
                }
            }

            console.log(`[getPRActivity] Fetched ${activities.length} activities for PR ${prId}`);
            return activities;
        } catch (error: any) {
            console.error(`[getPRActivity] Error fetching activity for PR ${prId}:`, error.message);
            throw error;
        }
    }

    static async getPRCommits(workspace: string, repoSlug: string, prId: number): Promise<any[]> {
        const commits: any[] = [];
        let nextPageUrl: string | undefined;
        let pageCount = 0;
        const MAX_PAGES = 50;

        try {
            while (true) {
                pageCount++;
                if (pageCount > MAX_PAGES) {
                    console.warn(`[getPRCommits] Max pages reached for PR ${prId}`);
                    break;
                }

                const url = nextPageUrl || `${ENV.BITBUCKET_API_BASE}/repositories/${workspace}/${repoSlug}/pullrequests/${prId}/commits`;

                const resp = await axios.get(url, {
                    auth: {
                        username: ENV.BITBUCKET_USERNAME,
                        password: ENV.BITBUCKET_API_TOKEN
                    },
                    headers: {
                        'Accept': 'application/json'
                    },
                    timeout: 30000
                });

                const fetchedCommits: any[] = resp.data?.values ?? [];
                commits.push(...fetchedCommits);

                nextPageUrl = resp.data?.next;
                if (!nextPageUrl || fetchedCommits.length === 0) {
                    break;
                }
            }

            console.log(`[getPRCommits] Fetched ${commits.length} commits for PR ${prId}`);
            return commits;
        } catch (error: any) {
            console.error(`[getPRCommits] Error fetching commits for PR ${prId}:`, error.message);
            throw error;
        }
    }
}

