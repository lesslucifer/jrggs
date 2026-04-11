import { ITelegramCommand, TelegramCommandContext } from '../types';
import JiraIssue from '../../../models/jira-issue.mongo';
import { requireLinkedUser } from '../utils';

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
            return void await ctx.reply(`Issue *${key}* not found.`);
        }

        const fields = issue.data?.fields || {};
        const summary = fields.summary || 'No summary';
        const status = fields.status?.name || 'Unknown';
        const assignee = fields.assignee?.displayName || 'Unassigned';
        const issueType = fields.issuetype?.name || 'Unknown';
        const sp = issue.current?.storyPoints ?? fields.story_points ?? fields.customfield_10028 ?? '—';
        const sprintName = issue.current?.sprintName || fields.sprint?.name || '—';

        const lines: string[] = [
            `*${key}* — ${summary}`,
            '',
            `Type: ${issueType}`,
            `Status: ${status}`,
            `Assignee: ${assignee}`,
            `SP: ${sp}`,
            `Sprint: ${sprintName}`,
        ];

        const userMetrics = issue.metrics?.[user.jiraUserId!];
        if (userMetrics) {
            lines.push('');
            lines.push('_Your metrics on this issue:_');
            lines.push(`  SP: ${userMetrics.storyPoints}, Rejections: ${userMetrics.nRejections}, Code Reviews: ${userMetrics.nCodeReviews}, PRs: ${userMetrics.nPRs}`);
        }

        await ctx.replyMd(lines.join('\n'));
    }
};

export default issueCmd;
