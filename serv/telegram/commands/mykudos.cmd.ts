import { ITelegramCommand, TelegramCommandContext } from '../types';
import Kudo, { KudoCategory } from '../../../models/kudo.mongo';
import { computeKudoScores } from '../../kudo-scores';
import { requireLinkedUser } from '../utils';

const mykudosCmd: ITelegramCommand = {
    name: 'mykudos',
    description: 'Your kudo summary — /mykudos [days]',
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

        const catCounts = new Map<string, number>();
        for (const k of received) {
            catCounts.set(k.category, (catCounts.get(k.category) ?? 0) + 1);
        }

        let response = `Your Kudos (last ${days} days)\n\n`;
        response += `Received: ${received.length} kudos (K: ${receivedK.toFixed(2)})\n`;
        for (const cat of Object.values(KudoCategory)) {
            const count = catCounts.get(cat);
            if (count) response += `  ${cat} x${count}\n`;
        }
        response += `\nGiven: ${given.length} kudos`;

        await ctx.reply(response);
    }
};

export default mykudosCmd;
