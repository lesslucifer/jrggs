import moment from 'moment';

export class HC {
    static readonly APP_NAME = 'APP_NAME';

    static readonly SUCCESS = { success: true };
    static readonly FAILED = { success: false };

    static readonly MINUTES_PER_DAY = 24 * 60;
    static readonly FIRST_DAY = moment([2010, 1, 1]);
    static readonly HUMAN32_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

    static readonly SYNC_ISSUES_LAST_UPDATE_TIME_KEY_PREFIX = 'SyncIssues_lastUpdateTime_4'
    static readonly SYNC_ISSUES_DEFAULT_LAST_UPDATE_TIME = moment([2024, 1, 1]).startOf('year').valueOf()

    static readonly OTP_EXPIRATION_SECS = 5 * 60

    static readonly JIRA_ISSUE_PROCESS_LIMIT = 5
    static readonly JIRA_PROJECT_KEYS = ['MBL6']

    static readonly BITBUCKET_WORKSPACE = 'friartuck'
    static readonly BITBUCKET_REPO_SLUG = 'mobile-app'
    static readonly BITBUCKET_PR_PROCESS_LIMIT = 5
    static readonly SYNC_PRS_DEFAULT_LAST_UPDATE_TIME = moment([2024, 1, 1]).startOf('year').valueOf()
}

export default HC;