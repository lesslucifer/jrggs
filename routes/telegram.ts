import { Body, DELETE, ExpressRouter, GET, PUT, Params, Query, Req } from 'express-router-ts';
import { USER_ROLE } from '../glob/cf';
import AuthServ from '../serv/auth';
import { Caller } from '../utils/decors';
import { AppLogicError } from '../utils/hera';
import User, { IUser } from '../models/user.mongo';
import AppConfig from '../models/app-config';
import { TelegramBotService } from '../serv/telegram/bot';
import OTP, { OTP_TYPE } from '../models/otp.model';

class TelegramRouter extends ExpressRouter {
    document = {
        tags: ['Telegram']
    }

    @AuthServ.authUser(USER_ROLE.ADMIN)
    @GET({ path: '/status' })
    async getStatus() {
        return { status: TelegramBotService.getStatus() };
    }

    @AuthServ.authUser(USER_ROLE.ADMIN)
    @PUT({ path: '/config' })
    async updateConfig(
        @Body('botToken') botToken: string
    ) {
        if (!botToken?.trim()) throw new AppLogicError('Bot token is required', 400);

        await AppConfig.updateOne(
            { key: 'telegram_bot_token' },
            { $set: { key: 'telegram_bot_token', value: botToken.trim() } },
            { upsert: true }
        );

        await TelegramBotService.restart(botToken.trim());
        return { status: TelegramBotService.getStatus() };
    }

    @AuthServ.authUser(USER_ROLE.ADMIN)
    @GET({ path: '/groups' })
    async listGroups() {
        const config = await AppConfig.findOne({ key: 'telegram_registered_groups' });
        return config?.value || [];
    }

    @AuthServ.authUser(USER_ROLE.ADMIN)
    @DELETE({ path: '/groups/:chatId' })
    async removeGroup(@Params('chatId') chatId: string) {
        const config = await AppConfig.findOne({ key: 'telegram_registered_groups' });
        const groups: any[] = config?.value || [];
        const filtered = groups.filter(g => String(g.chatId) !== chatId);
        if (filtered.length === groups.length) {
            throw new AppLogicError('Group not found', 404);
        }

        await AppConfig.updateOne(
            { key: 'telegram_registered_groups' },
            { $set: { value: filtered } }
        );
    }

    @AuthServ.authUser(USER_ROLE.USER)
    @GET({ path: '/link-callback' })
    async linkCallback(@Query('token') token: string, @Caller() caller: IUser) {
        if (!token) throw new AppLogicError('Token is required', 400);

        const otpDoc = await OTP.findOneAndDelete({
            otp: token,
            type: OTP_TYPE.TELEGRAM_LINK,
            expiresAt: { $gt: Date.now() },
        });
        if (!otpDoc) throw new AppLogicError('Invalid or expired link token', 400);

        const existingLink = await User.findOne({ telegramUserId: (otpDoc as any).telegramUserId });
        if (existingLink) {
            throw new AppLogicError('This Telegram account is already linked to another user', 400);
        }

        await User.updateOne(
            { _id: caller._id },
            { $set: { telegramUserId: (otpDoc as any).telegramUserId } }
        );

        const bot = TelegramBotService.getBot();
        if (bot && (otpDoc as any).telegramUserId) {
            await bot.sendMessage((otpDoc as any).telegramUserId,
                `Your Telegram account is now linked to ${caller.name}.`
            ).catch(() => {});
        }

        return { linked: true, userName: caller.name, userEmail: caller.email, telegramUserId: (otpDoc as any).telegramUserId };
    }
}

export default new TelegramRouter();
