import TelegramBot from 'node-telegram-bot-api';

export interface TelegramCommandContext {
    bot: TelegramBot;
    msg: TelegramBot.Message;
    args: string[];
    chatId: number;
    telegramUserId: number;
    isGroupChat: boolean;
}

export interface ITelegramCommand {
    name: string;
    aliases?: string[];
    description: string;
    adminOnly?: boolean;
    handler: (ctx: TelegramCommandContext) => Promise<void>;
}
