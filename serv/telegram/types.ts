import TelegramBot from 'node-telegram-bot-api';

export interface TelegramCommandContext {
    bot: TelegramBot;
    msg: TelegramBot.Message;
    args: string[];
    chatId: number;
    telegramUserId: number;
    isGroupChat: boolean;
    reply: (text: string) => Promise<TelegramBot.Message>;
    replyMd: (text: string) => Promise<TelegramBot.Message>;
}

export interface ITelegramCommand {
    name: string;
    aliases?: string[];
    description: string;
    adminOnly?: boolean;
    handler: (ctx: TelegramCommandContext) => Promise<void>;
}
