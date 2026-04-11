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

    return user;
}
