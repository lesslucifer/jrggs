import { ITelegramCommand, TelegramCommandContext } from '../types';

const helpCmd: ITelegramCommand = {
    name: 'help',
    description: 'Show available commands',
    async handler(ctx: TelegramCommandContext) {
        const text = [
            'Kudo Bot Commands',
            '',
            '/kudo @user category message',
            '  Give a kudo',
            '  Categories: teamwork (tw), innovation (inn), ownership (own), communication (com), mentoring (men)',
            '',
            '/mykudos [days]',
            '  Your kudo summary (default: 30 days)',
            '',
            '/leaderboard',
            '  Top kudo receivers this month',
            '',
            '/link',
            '  Link your Telegram account',
            '',
            '/unlink',
            '  Unlink your Telegram account',
            '',
            '/help',
            '  Show this message',
        ].join('\n');

        await ctx.bot.sendMessage(ctx.chatId, text);
    }
};

export default helpCmd;
