import { ITelegramCommand, TelegramCommandContext } from '../types';
import Kudo from '../../../models/kudo.mongo';
import { computeKudoScores } from '../../kudo-scores';
import { requireLinkedUser } from '../utils';

const mykudosCmd: ITelegramCommand = {
    name: 'mykudos',
    description: 'Your kudo summary',
    usage: '/mykudos [days]',
    async handler(ctx: TelegramCommandContext) {
        const sender = await requireLinkedUser(ctx);
        if (!sender) return;

        const days = Math.min(Math.max(parseInt(ctx.args[0]) || 30, 1), 365);
        const endDate = Date.now();
        const startDate = endDate - days * 86_400_000;

        const received = await Kudo.find({
            toUserId: sender.jiraUserId,
            createdAt: { $gte: startDate, $lte: endDate }
        }).toArray();

        const given = await Kudo.find({
            fromUserId: sender.jiraUserId,
            createdAt: { $gte: startDate, $lte: endDate }
        }).toArray();

        const scores = await computeKudoScores(startDate, endDate, days);
        const receivedK = scores.get(sender.jiraUserId) ?? 0;

        const lines = [
            `<b>Your Kudos</b> — last ${days} days`,
            '',
            `Received: ${received.length} kudos (K: <b>${receivedK.toFixed(2)}</b>)`,
            `Given: ${given.length} kudos`,
        ];

        await ctx.replyHtml(lines.join('\n'));
    }
};

export default mykudosCmd;
