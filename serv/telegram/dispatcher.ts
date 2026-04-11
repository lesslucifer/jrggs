import TelegramBot from 'node-telegram-bot-api';
import { ITelegramCommand, TelegramCommandContext } from './types';
import AppConfig from '../../models/app-config';
import kudoCmd from './commands/kudo.cmd';
import mykudosCmd from './commands/mykudos.cmd';
import linkCmds from './commands/link.cmd';
import registerCmds from './commands/register.cmd';
import helpCmd from './commands/help.cmd';
import issueCmd from './commands/issue.cmd';
import myissuesCmd from './commands/myissues.cmd';
import mystatsCmd from './commands/mystats.cmd';

const ALL_COMMANDS: ITelegramCommand[] = [
    kudoCmd,
    mykudosCmd,
    ...linkCmds,
    ...registerCmds,
    issueCmd,
    myissuesCmd,
    mystatsCmd,
    helpCmd,
];

export class TelegramDispatcher {
    private commands = new Map<string, ITelegramCommand>();

    constructor(private bot: TelegramBot) {}

    async init(): Promise<void> {
        this.registerCommands();
        this.bot.on('message', (msg) => this.handleMessage(msg));

        const unique = this.getCommands().filter(c => !c.adminOnly);
        await this.bot.setMyCommands(
            unique.map(c => ({ command: c.name, description: c.description }))
        );
    }

    private registerCommands(): void {
        for (const cmd of ALL_COMMANDS) {
            this.commands.set(cmd.name, cmd);
            cmd.aliases?.forEach(a => this.commands.set(a, cmd));
        }
    }

    private async handleMessage(msg: TelegramBot.Message): Promise<void> {
        if (!msg.text?.startsWith('/')) return;

        const parts = msg.text.split(/\s+/);
        const rawCmd = parts[0].substring(1).split('@')[0].toLowerCase();
        const args = parts.slice(1);

        const cmd = this.commands.get(rawCmd);
        if (!cmd) return;

        const chatId = msg.chat.id;
        const isGroupChat = msg.chat.type === 'group' || msg.chat.type === 'supergroup';

        if (isGroupChat) {
            const groups = await AppConfig.findOne({ key: 'telegram_registered_groups' });
            const registered = (groups?.value as any[] || []).some(g => g.chatId === chatId);
            if (!registered && rawCmd !== 'register') return;
        }

        const ctx: TelegramCommandContext = {
            bot: this.bot,
            msg,
            args,
            chatId,
            telegramUserId: msg.from!.id,
            isGroupChat,
            allCommands: this.getCommands(),
            reply: (text: string) => this.bot.sendMessage(chatId, text, isGroupChat ? { reply_to_message_id: msg.message_id } : undefined),
            replyMd: (text: string) => this.bot.sendMessage(chatId, text, { parse_mode: 'Markdown', ...(isGroupChat ? { reply_to_message_id: msg.message_id } : undefined) }),
            replyHtml: (text: string) => this.bot.sendMessage(chatId, text, { parse_mode: 'HTML', disable_web_page_preview: true, ...(isGroupChat ? { reply_to_message_id: msg.message_id } : undefined) }),
        };

        if (cmd.dmOnly && isGroupChat) {
            return void await ctx.reply('This command can only be used in a direct message. Please DM me to use this command.');
        }

        try {
            await cmd.handler(ctx);
        } catch (err: any) {
            await ctx.reply(`Error: ${err.message || 'Something went wrong'}`);
        }
    }

    getCommands(): ITelegramCommand[] {
        return [...new Set(this.commands.values())];
    }
}
