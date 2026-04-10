import TelegramBot from 'node-telegram-bot-api';
import AppConfig from '../../models/app-config';
import { TelegramDispatcher } from './dispatcher';

export class TelegramBotService {
    private static bot: TelegramBot | null = null;
    private static dispatcher: TelegramDispatcher | null = null;
    private static currentToken: string | null = null;

    static getBot(): TelegramBot | null { return this.bot; }

    static getStatus(): 'connected' | 'disconnected' | 'error' {
        if (!this.bot) return 'disconnected';
        return this.bot.isPolling() ? 'connected' : 'error';
    }

    static async start(token?: string): Promise<void> {
        if (!token) {
            const config = await AppConfig.findOne({ key: 'telegram_bot_token' });
            token = config?.value;
        }
        if (!token) return;

        if (this.bot && this.currentToken === token) return;
        await this.stop();

        this.bot = new TelegramBot(token, { polling: true });
        this.currentToken = token;
        this.dispatcher = new TelegramDispatcher(this.bot);
        await this.dispatcher.init();

        this.bot.on('polling_error', (err) => {
            console.error('[Telegram] Polling error:', err.message);
        });
    }

    static async stop(): Promise<void> {
        if (this.bot) {
            await this.bot.stopPolling();
            this.bot = null;
            this.dispatcher = null;
            this.currentToken = null;
        }
    }

    static async restart(newToken: string): Promise<void> {
        await this.stop();
        await this.start(newToken);
    }
}
