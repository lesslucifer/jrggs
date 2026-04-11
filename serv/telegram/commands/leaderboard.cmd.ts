import { ITelegramCommand, TelegramCommandContext } from '../types';
import User from '../../../models/user.mongo';
import { computeKudoScores } from '../../kudo-scores';
import Kudo from '../../../models/kudo.mongo';
import moment from 'moment';
import { requireLinkedUser } from '../utils';

const leaderboardCmd: ITelegramCommand = {
    name: 'leaderboard',
    description: 'Top kudo receivers this month',
    async handler(ctx: TelegramCommandContext) {
        const sender = await requireLinkedUser(ctx);
        if (!sender) return;

        const now = moment();
        const startDate = now.clone().startOf('month').valueOf();
        const endDate = now.valueOf();
        const rangeDays = now.date();

        const scores = await computeKudoScores(startDate, endDate, rangeDays);

        const kudos = await Kudo.find({
            createdAt: { $gte: startDate, $lte: endDate }
        }).toArray();
        const kudoCounts = new Map<string, number>();
        for (const k of kudos) {
            kudoCounts.set(k.toUserId, (kudoCounts.get(k.toUserId) ?? 0) + 1);
        }

        const sorted = [...scores.entries()]
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5);

        if (sorted.length === 0) {
            return void await ctx.reply('No kudos given this month yet.');
        }

        const jiraUserIds = sorted.map(([id]) => id);
        const users = await User.find({ jiraUserId: { $in: jiraUserIds } }).toArray();
        const nameMap = new Map(users.map(u => [u.jiraUserId!, u.name]));

        let response = `Kudo Leaderboard (${now.format('MMMM YYYY')})\n\n`;
        sorted.forEach(([userId, kScore], i) => {
            const name = nameMap.get(userId) || userId;
            const count = kudoCounts.get(userId) || 0;
            response += `${i + 1}. ${name} — ${count} kudos (K: ${kScore.toFixed(2)})\n`;
        });

        await ctx.reply(response);
    }
};

export default leaderboardCmd;
