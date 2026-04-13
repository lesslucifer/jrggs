import { ITelegramCommand, TelegramCommandContext } from '../types';
import User from '../../../models/user.mongo';
import Kudo from '../../../models/kudo.mongo';
import KudoEligibleGiver from '../../../models/kudo-eligible-giver.mongo';
import { requireLinkedUser } from '../utils';

const RATE_LIMIT = new Map<number, number>();

const kudoCmd: ITelegramCommand = {
    name: 'kudo',
    description: 'Give a kudo',
    usage: '/kudo @user message',
    async handler(ctx: TelegramCommandContext) {
        const lastKudo = RATE_LIMIT.get(ctx.telegramUserId);
        if (lastKudo && Date.now() - lastKudo < 60_000) {
            return void await ctx.reply('Please wait a minute before sending another kudo.');
        }

        if (ctx.args.length < 2) {
            return void await ctx.reply('Usage: /kudo @username message');
        }

        const recipientRef = ctx.args[0].replace('@', '');
        const message = ctx.args.slice(1).join(' ').slice(0, 280);

        const sender = await requireLinkedUser(ctx);
        if (!sender) return;

        const eligible = await KudoEligibleGiver.findOne({ userId: sender._id.toHexString() });
        if (!eligible) {
            return void await ctx.reply('You are not eligible to give kudos.');
        }

        let recipient = await User.findOne({
            telegramUserId: { $exists: true },
            telegramUsername: recipientRef.toLowerCase(),
        });

        if (!recipient && ctx.msg.entities) {
            const textMention = ctx.msg.entities.find(e => e.type === 'text_mention' && e.user);
            if (textMention?.user) {
                recipient = await User.findOne({ telegramUserId: textMention.user.id });
            }
        }

        if (!recipient) {
            return void await ctx.reply(
                `Could not find user ${recipientRef}. Make sure they have linked their Telegram account.`
            );
        }

        if (!recipient.jiraUserId) {
            return void await ctx.reply(
                `${recipient.name} has not linked their Jira account. They need an admin to set their Jira User ID in the Users page.`
            );
        }

        if (sender.jiraUserId === recipient.jiraUserId) {
            return void await ctx.reply('You cannot give a kudo to yourself.');
        }

        await Kudo.insertOne({
            fromUserId: sender.jiraUserId,
            toUserId: recipient.jiraUserId,
            message,
            createdAt: Date.now(),
        } as any);

        RATE_LIMIT.set(ctx.telegramUserId, Date.now());

        const escapedMessage = message.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        const response = [
            `<b>Kudo sent</b>`,
            `${sender.name} → ${recipient.name}`,
            `<i>"${escapedMessage}"</i>`,
        ].join('\n');
        await ctx.replyHtml(response);

        if (!ctx.isGroupChat && recipient.telegramUserId) {
            const dm = [
                `<b>You received a kudo from ${sender.name}</b>`,
                `<i>"${escapedMessage}"</i>`,
            ].join('\n');
            await ctx.bot.sendMessage(recipient.telegramUserId, dm, { parse_mode: 'HTML' }).catch(() => {});
        }
    }
};

export default kudoCmd;
