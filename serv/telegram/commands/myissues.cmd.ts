import { ITelegramCommand, TelegramCommandContext } from '../types';
import JiraIssue from '../../../models/jira-issue.mongo';
import { requireLinkedUser } from '../utils';

const STATUS_ORDER: Record<string, number> = { 'To Do': 0, 'In Progress': 1, 'Code Review': 2, 'Done': 3 };

const myissuesCmd: ITelegramCommand = {
    name: 'myissues',
    description: 'Your active issues',
    usage: '/myissues',
    async handler(ctx: TelegramCommandContext) {
        const user = await requireLinkedUser(ctx);
        if (!user) return;

        const issues = await JiraIssue.find({
            inChargeDevs: user.jiraUserId,
            $or: [
                { completedAt: null },
                { completedAt: { $exists: false } },
                { completedAt: { $gte: Date.now() - 14 * 86_400_000 } },
            ]
        }).sort({ completedAt: 1, _id: -1 }).limit(15).toArray();

        if (!issues.length) {
            return void await ctx.reply('No active issues found.');
        }

        const grouped = new Map<string, typeof issues>();
        for (const issue of issues) {
            const status = issue.current?.status || issue.data?.fields?.status?.name || 'Unknown';
            if (!grouped.has(status)) grouped.set(status, []);
            grouped.get(status)!.push(issue);
        }

        const sortedStatuses = [...grouped.keys()].sort((a, b) => (STATUS_ORDER[a] ?? 99) - (STATUS_ORDER[b] ?? 99));

        const lines: string[] = ['*Your Issues*', ''];
        for (const status of sortedStatuses) {
            lines.push(`_${status}_`);
            for (const issue of grouped.get(status)!) {
                const summary = (issue.data?.fields?.summary || '').slice(0, 40);
                const sp = issue.current?.storyPoints ?? '—';
                lines.push(`  ${issue.key} (${sp} SP) ${summary}`);
            }
            lines.push('');
        }

        await ctx.replyMd(lines.join('\n'));
    }
};

export default myissuesCmd;
