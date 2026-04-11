import TelegramBot from 'node-telegram-bot-api';

export interface TelegramCommandContext {
    bot: TelegramBot;
    msg: TelegramBot.Message;
    args: string[];
    chatId: number;
    telegramUserId: number;
    isGroupChat: boolean;
    allCommands: ITelegramCommand[];
    reply: (text: string) => Promise<TelegramBot.Message>;
    replyMd: (text: string) => Promise<TelegramBot.Message>;
    replyHtml: (text: string) => Promise<TelegramBot.Message>;
}

export interface ITelegramCommand {
    name: string;
    aliases?: string[];
    description: string;
    adminOnly?: boolean;
    dmOnly?: boolean;
    usage?: string;
    handler: (ctx: TelegramCommandContext) => Promise<void>;
}
