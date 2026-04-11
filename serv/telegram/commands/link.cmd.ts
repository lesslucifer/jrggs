import { ITelegramCommand, TelegramCommandContext } from '../types';
import User from '../../../models/user.mongo';
import OTP, { OTP_TYPE } from '../../../models/otp.model';
import { customAlphabet } from 'nanoid';
import HC from '../../../glob/hc';
import { ObjectId } from 'mongodb';
import ENV from '../../../glob/env';

const otpGenerator = customAlphabet(HC.HUMAN32_ALPHABET);

const linkCmd: ITelegramCommand = {
    name: 'link',
    description: 'Link your Telegram account (DM only)',
    dmOnly: true,
    usage: '/link',
    async handler(ctx: TelegramCommandContext) {
        const existing = await User.findOne({ telegramUserId: ctx.telegramUserId });
        if (existing) {
            return void await ctx.reply(`Your Telegram account is already linked to ${existing.name}.`);
        }

        const otp = otpGenerator(32);
        await OTP.insertOne({
            otp,
            userId: new ObjectId('000000000000000000000000'),
            type: OTP_TYPE.TELEGRAM_LINK,
            expiresAt: Date.now() + HC.OTP_EXPIRATION_SECS * 1000,
            telegramUserId: ctx.telegramUserId,
        } as any);

        const linkUrl = `${ENV.APP_DOMAIN}/auth/telegram-link?token=${otp}`;
        await ctx.reply(`Click the link below to connect your Telegram account:\n${linkUrl}\n\nThis link expires in 5 minutes.`);
    }
};

const unlinkCmd: ITelegramCommand = {
    name: 'unlink',
    description: 'Unlink your Telegram account (DM only)',
    dmOnly: true,
    usage: '/unlink',
    async handler(ctx: TelegramCommandContext) {
        const result = await User.updateOne(
            { telegramUserId: ctx.telegramUserId },
            { $unset: { telegramUserId: '' } }
        );

        if (result.modifiedCount === 0) {
            return void await ctx.reply( 'Your Telegram account is not linked.');
        }

        await ctx.reply( 'Your Telegram account has been unlinked.');
    }
};

export default [linkCmd, unlinkCmd];
