import { ITelegramCommand, TelegramCommandContext } from '../types';
import JiraIssue, { IJiraIssueMetrics } from '../../../models/jira-issue.mongo';
import JiraObject from '../../../models/jira-object.mongo';
import { computeKudoScores } from '../../kudo-scores';
import { requireLinkedUser } from '../utils';

const mystatsCmd: ITelegramCommand = {
    name: 'mystats',
    description: 'Your sprint/period stats — /mystats [sprintId]',
    async handler(ctx: TelegramCommandContext) {
        const user = await requireLinkedUser(ctx);
        if (!user) return;

        const sprintIdArg = parseInt(ctx.args[0]);
        let filter: Record<string, any> = { inChargeDevs: user.jiraUserId };
        let periodLabel: string;

        if (sprintIdArg) {
            filter.sprintIds = sprintIdArg;
            const sprint = await JiraObject.findOne({ type: 'sprint', id: String(sprintIdArg) });
            periodLabel = sprint?.fields?.displayName || `Sprint ${sprintIdArg}`;
        } else {
            const now = new Date().toISOString().slice(0, 10);
            const activeSprint = await JiraObject.findOne({
                type: 'sprint',
                'fields.startDate': { $lte: now },
                'fields.endDate': { $gte: now },
            });
            if (activeSprint) {
                filter.sprintIds = parseInt(activeSprint.id);
                periodLabel = activeSprint.fields?.displayName || `Sprint ${activeSprint.id}`;
            } else {
                filter.completedAt = { $gte: Date.now() - 30 * 86_400_000 };
                periodLabel = 'Last 30 days';
            }
        }

        const issues = await JiraIssue.find(filter).toArray();

        const totals: IJiraIssueMetrics = { storyPoints: 0, nRejections: 0, defects: 0, nCodeReviews: 0, nPRs: 0, prPoints: 0 };
        for (const issue of issues) {
            const m = issue.metrics?.[user.jiraUserId!];
            if (!m) continue;
            totals.storyPoints += m.storyPoints;
            totals.nRejections += m.nRejections;
            totals.defects += m.defects;
            totals.nCodeReviews += m.nCodeReviews;
            totals.nPRs += m.nPRs;
            totals.prPoints += m.prPoints;
        }

        const endDate = Date.now();
        const startDate = endDate - 30 * 86_400_000;
        const scores = await computeKudoScores(startDate, endDate, 30);
        const kudoScore = scores.get(user.jiraUserId!) ?? 0;

        const lines: string[] = [
            `*Your Stats — ${periodLabel}*`,
            '',
            `Issues: ${issues.length}`,
            `Story Points: ${totals.storyPoints}`,
            `Rejections: ${totals.nRejections}`,
            `Defects: ${totals.defects}`,
            `Code Reviews: ${totals.nCodeReviews}`,
            `PRs: ${totals.nPRs}`,
            `PR Points: ${totals.prPoints}`,
            '',
            `Kudo Score (30d): ${kudoScore.toFixed(2)}`,
        ];

        await ctx.replyMd(lines.join('\n'));
    }
};

export default mystatsCmd;
