import { ITelegramCommand, TelegramCommandContext } from '../types';
import AppConfig from '../../../models/app-config';
import User from '../../../models/user.mongo';
import { USER_ROLE } from '../../../glob/cf';

async function getLinkedAdmin(telegramUserId: number) {
    const user = await User.findOne({ telegramUserId });
    if (!user || !user.roles.includes(USER_ROLE.ADMIN)) return null;
    return user;
}

const registerCmd: ITelegramCommand = {
    name: 'register',
    description: 'Register this group for Kudo Bot (admin only)',
    adminOnly: true,
    async handler(ctx: TelegramCommandContext) {
        if (!ctx.isGroupChat) {
            return void await ctx.reply('This command can only be used in a group chat.');
        }

        const admin = await getLinkedAdmin(ctx.telegramUserId);
        if (!admin) {
            return void await ctx.reply('You must be a linked admin to register groups.');
        }

        const existing = await AppConfig.findOne({ key: 'telegram_registered_groups' });
        const groups: any[] = existing?.value || [];

        if (groups.some(g => g.chatId === ctx.chatId)) {
            return void await ctx.reply('This group is already registered.');
        }

        groups.push({
            chatId: ctx.chatId,
            name: ctx.msg.chat.title || 'Unknown',
            registeredAt: Date.now(),
            registeredBy: admin._id.toHexString(),
        });

        await AppConfig.updateOne(
            { key: 'telegram_registered_groups' },
            { $set: { key: 'telegram_registered_groups', value: groups } },
            { upsert: true }
        );

        await ctx.reply('This group is now registered for Kudo Bot.');
    }
};

const unregisterCmd: ITelegramCommand = {
    name: 'unregister',
    description: 'Unregister this group (admin only)',
    adminOnly: true,
    async handler(ctx: TelegramCommandContext) {
        if (!ctx.isGroupChat) {
            return void await ctx.reply('This command can only be used in a group chat.');
        }

        const admin = await getLinkedAdmin(ctx.telegramUserId);
        if (!admin) {
            return void await ctx.reply('You must be a linked admin to unregister groups.');
        }

        const existing = await AppConfig.findOne({ key: 'telegram_registered_groups' });
        const groups: any[] = existing?.value || [];
        const filtered = groups.filter(g => g.chatId !== ctx.chatId);

        if (filtered.length === groups.length) {
            return void await ctx.reply('This group is not registered.');
        }

        await AppConfig.updateOne(
            { key: 'telegram_registered_groups' },
            { $set: { value: filtered } }
        );

        await ctx.reply('This group has been unregistered.');
    }
};

export default [registerCmd, unregisterCmd];
