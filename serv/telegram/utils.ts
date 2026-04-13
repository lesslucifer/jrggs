import User, { IUser } from '../../models/user.mongo';
import { TelegramCommandContext } from './types';

export async function requireLinkedUser(ctx: TelegramCommandContext): Promise<IUser | null> {
    const user = await User.findOne({ telegramUserId: ctx.telegramUserId });
    if (!user) {
        await ctx.reply('Your Telegram account is not linked. Use /link to connect your account.');
        return null;
    }

    if (!user.jiraUserId) {
        await ctx.reply('Your Jira account is not linked. Use /link to connect your account.');
        return null;
    }

    const currentUsername = ctx.msg.from?.username?.toLowerCase();
    if (currentUsername && user.telegramUsername !== currentUsername) {
        await User.updateOne({ _id: user._id }, { $set: { telegramUsername: currentUsername } });
        user.telegramUsername = currentUsername;
    }

    return user;
}
