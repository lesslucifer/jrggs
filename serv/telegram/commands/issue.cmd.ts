import { ITelegramCommand, TelegramCommandContext } from '../types';
import JiraIssue from '../../../models/jira-issue.mongo';
import { requireLinkedUser } from '../utils';
import ENV from '../../../glob/env';

function escapeHtml(text: string) {
    return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

const issueCmd: ITelegramCommand = {
    name: 'issue',
    description: 'Look up a JIRA issue',
    usage: '/issue KEY-123',
    async handler(ctx: TelegramCommandContext) {
        const user = await requireLinkedUser(ctx);
        if (!user) return;

        if (!ctx.args[0]) {
            return void await ctx.reply('Usage: /issue KEY-123');
        }

        const key = ctx.args[0].toUpperCase();
        const issue = await JiraIssue.findOne({ key });
        if (!issue) {
            return void await ctx.reply(`Issue ${key} not found.`);
        }

        const fields = issue.data?.fields || {};
        const summary = escapeHtml(fields.summary || 'No summary');
        const status = escapeHtml(fields.status?.name || 'Unknown');
        const assignee = escapeHtml(fields.assignee?.displayName || 'Unassigned');
        const issueType = escapeHtml(fields.issuetype?.name || 'Unknown');
        const sp = issue.current?.storyPoints ?? fields.story_points ?? fields.customfield_10028 ?? '—';
        const sprintName = escapeHtml(issue.current?.sprintName || fields.sprint?.name || '—');
        const jiraUrl = `${ENV.JIRA_HOST}/browse/${key}`;

        const lines: string[] = [
            `<a href="${jiraUrl}"><b>${key}</b></a>  ${summary}`,
            '',
            `<b>Type</b>      ${issueType}`,
            `<b>Status</b>    ${status}`,
            `<b>Assignee</b>  ${assignee}`,
            `<b>SP</b>        ${sp}`,
            `<b>Sprint</b>    ${sprintName}`,
        ];

        const userMetrics = issue.metrics?.[user.jiraUserId!];
        if (userMetrics) {
            lines.push('');
            lines.push('<i>Your metrics on this issue</i>');
            lines.push(`  SP: ${userMetrics.storyPoints}  |  Rejections: ${userMetrics.nRejections}  |  Reviews: ${userMetrics.nCodeReviews}  |  PRs: ${userMetrics.nPRs}`);
        }

        await ctx.replyHtml(lines.join('\n'));
    }
};

export default issueCmd;
