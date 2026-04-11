import { ITelegramCommand, TelegramCommandContext } from '../types';

const helpCmd: ITelegramCommand = {
    name: 'help',
    description: 'Show available commands',
    usage: '/help',
    async handler(ctx: TelegramCommandContext) {
        const lines = ['Available Commands', ''];
        for (const cmd of ctx.allCommands) {
            if (cmd.adminOnly) continue;
            const usage = cmd.usage || `/${cmd.name}`;
            lines.push(usage);
            lines.push(`  ${cmd.description}`);
            lines.push('');
        }
        await ctx.reply(lines.join('\n'));
    }
};

export default helpCmd;
