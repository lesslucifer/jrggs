import { ITelegramCommand, TelegramCommandContext } from '../types';

const helpCmd: ITelegramCommand = {
    name: 'help',
    description: 'Show available commands',
    usage: '/help',
    async handler(ctx: TelegramCommandContext) {
        const lines = ['<b>Available Commands</b>', ''];
        for (const cmd of ctx.allCommands) {
            if (cmd.adminOnly) continue;
            const usage = cmd.usage || `/${cmd.name}`;
            lines.push(`<code>${usage}</code>`);
            lines.push(`  ${cmd.description}`);
            lines.push('');
        }
        await ctx.replyHtml(lines.join('\n'));
    }
};

export default helpCmd;
