import moment from 'moment';

export class HC {
    static readonly APP_NAME = 'APP_NAME';

    static readonly SUCCESS = { success: true };
    static readonly FAILED = { success: false };

    static readonly MINUTES_PER_DAY = 24 * 60;
    static readonly FIRST_DAY = moment([2010, 1, 1]);
    static readonly HUMAN32_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

    static readonly SYNC_ISSUES_DEFAULT_LAST_UPDATE_TIME = moment([2024, 1, 1]).startOf('year').unix()
}

export default HC;