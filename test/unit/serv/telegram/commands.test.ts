import { describe, it, expect, beforeEach } from 'vitest';
import sinon from 'sinon';
import { ObjectId } from 'mongodb';
import { TelegramCommandContext } from '../../../../serv/telegram/types';
import User from '../../../../models/user.mongo';
import Kudo from '../../../../models/kudo.mongo';
import KudoEligibleGiver from '../../../../models/kudo-eligible-giver.mongo';
import AppConfig from '../../../../models/app-config';
import OTP from '../../../../models/otp.model';
import { stubModel } from '../../../utils/stub-helpers';
import { mockUser, mockAdmin, mockKudo, mockEligibleGiver } from '../../../utils/mock-factories';
import kudoCmd from '../../../../serv/telegram/commands/kudo.cmd';
import linkCmds from '../../../../serv/telegram/commands/link.cmd';
import registerCmds from '../../../../serv/telegram/commands/register.cmd';
import leaderboardCmd from '../../../../serv/telegram/commands/leaderboard.cmd';
import mykudosCmd from '../../../../serv/telegram/commands/mykudos.cmd';
import helpCmd from '../../../../serv/telegram/commands/help.cmd';

const [linkCmd, unlinkCmd] = linkCmds;
const [registerCmd, unregisterCmd] = registerCmds;

function buildMockCtx(overrides?: Partial<TelegramCommandContext>): TelegramCommandContext {
    return {
        bot: { sendMessage: sinon.stub().resolves({}) } as any,
        msg: { message_id: 1, chat: { id: 1, title: 'Test Group' }, from: { id: 1 } } as any,
        args: [],
        chatId: 1,
        telegramUserId: 1,
        isGroupChat: false,
        allCommands: [],
        reply: sinon.stub().resolves({} as any),
        replyMd: sinon.stub().resolves({} as any),
        ...overrides,
    };
}

describe('Telegram Commands', () => {
    let sandbox: sinon.SinonSandbox;

    beforeEach(() => {
        sandbox = (global as any).__sandbox;
    });

    describe('kudo.cmd', () => {
        it('should reply with usage when no args', async () => {
            const ctx = buildMockCtx({ args: [] });
            await kudoCmd.handler(ctx);
            expect((ctx.reply as sinon.SinonStub).calledOnce).toBe(true);
            expect((ctx.reply as sinon.SinonStub).firstCall.args[0]).toContain('Usage:');
        });

        it('should reply with usage when only 1 arg', async () => {
            const ctx = buildMockCtx({ args: ['@someone'] });
            await kudoCmd.handler(ctx);
            expect((ctx.reply as sinon.SinonStub).firstCall.args[0]).toContain('Usage:');
        });

        it('should prompt link when sender not linked', async () => {
            stubModel(sandbox, User, 'findOne', null);
            const ctx = buildMockCtx({ telegramUserId: 100, args: ['@bob', 'nice'] });
            await kudoCmd.handler(ctx);
            expect((ctx.reply as sinon.SinonStub).firstCall.args[0]).toContain('not linked');
        });

        it('should reject non-eligible sender', async () => {
            const sender = mockUser({ telegramUserId: 100, jiraUserId: 'JIRA-1' });
            const findOneStub = stubModel(sandbox, User, 'findOne', sender);
            stubModel(sandbox, KudoEligibleGiver, 'findOne', null);
            const ctx = buildMockCtx({ telegramUserId: 100, args: ['@bob', 'nice'] });
            await kudoCmd.handler(ctx);
            expect((ctx.reply as sinon.SinonStub).calledOnce).toBe(true);
            expect((ctx.reply as sinon.SinonStub).firstCall.args[0]).toContain('not eligible');
        });

        it('should reject unknown recipient', async () => {
            const sender = mockUser({ telegramUserId: 100, jiraUserId: 'JIRA-1' });
            const eligible = mockEligibleGiver({ userId: sender._id.toHexString() });

            const findOneUser = stubModel(sandbox, User, 'findOne', null);
            findOneUser.onFirstCall().resolves(sender);
            findOneUser.onSecondCall().resolves(null);
            stubModel(sandbox, KudoEligibleGiver, 'findOne', eligible);

            const ctx = buildMockCtx({ telegramUserId: 100, args: ['@unknown', 'nice'] });
            await kudoCmd.handler(ctx);
            expect((ctx.reply as sinon.SinonStub).firstCall.args[0]).toContain('Could not find user');
        });

        it('should block self-kudo', async () => {
            const sender = mockUser({ telegramUserId: 100, jiraUserId: 'JIRA-1', name: 'Alice' });
            const eligible = mockEligibleGiver({ userId: sender._id.toHexString() });

            const findOneUser = stubModel(sandbox, User, 'findOne', null);
            findOneUser.onFirstCall().resolves(sender);
            findOneUser.onSecondCall().resolves(sender);
            stubModel(sandbox, KudoEligibleGiver, 'findOne', eligible);

            const ctx = buildMockCtx({ telegramUserId: 100, args: ['@Alice', 'nice'] });
            await kudoCmd.handler(ctx);
            expect((ctx.reply as sinon.SinonStub).firstCall.args[0]).toContain('cannot give a kudo to yourself');
        });

        it('should reject recipient without jiraUserId', async () => {
            const sender = mockUser({ telegramUserId: 100, jiraUserId: 'JIRA-1' });
            const recipient = mockUser({ telegramUserId: 200, jiraUserId: undefined, name: 'Bob' });
            const eligible = mockEligibleGiver({ userId: sender._id.toHexString() });

            const findOneUser = stubModel(sandbox, User, 'findOne', null);
            findOneUser.onFirstCall().resolves(sender);
            findOneUser.onSecondCall().resolves(recipient);
            stubModel(sandbox, KudoEligibleGiver, 'findOne', eligible);

            const ctx = buildMockCtx({ telegramUserId: 100, args: ['@Bob', 'good'] });
            await kudoCmd.handler(ctx);
            expect((ctx.reply as sinon.SinonStub).firstCall.args[0]).toContain('has not linked their Jira account');
        });

        it('should give kudo successfully', async () => {
            const sender = mockUser({ telegramUserId: 100, jiraUserId: 'JIRA-1', name: 'Alice' });
            const recipient = mockUser({ telegramUserId: 200, jiraUserId: 'JIRA-2', name: 'Bob' });
            const eligible = mockEligibleGiver({ userId: sender._id.toHexString() });

            const findOneUser = stubModel(sandbox, User, 'findOne', null);
            findOneUser.onFirstCall().resolves(sender);
            findOneUser.onSecondCall().resolves(recipient);
            stubModel(sandbox, KudoEligibleGiver, 'findOne', eligible);
            const insertStub = stubModel(sandbox, Kudo, 'insertOne', { insertedId: new ObjectId(), acknowledged: true });

            const ctx = buildMockCtx({ telegramUserId: 100, args: ['@Bob', 'Great', 'job'] });
            await kudoCmd.handler(ctx);

            expect(insertStub.calledOnce).toBe(true);
            const insertedDoc = insertStub.firstCall.args[0];
            expect(insertedDoc.fromUserId).toBe('JIRA-1');
            expect(insertedDoc.toUserId).toBe('JIRA-2');
            expect(insertedDoc.message).toBe('Great job');
            expect((ctx.reply as sinon.SinonStub).firstCall.args[0]).toContain('Kudo sent');
        });

        it('should send DM to recipient in private chat', async () => {
            const sender = mockUser({ telegramUserId: 500, jiraUserId: 'JIRA-51', name: 'DmSender' });
            const recipient = mockUser({ telegramUserId: 600, jiraUserId: 'JIRA-52', name: 'DmRecipient' });
            const eligible = mockEligibleGiver({ userId: sender._id.toHexString() });

            const findOneUser = stubModel(sandbox, User, 'findOne', null);
            findOneUser.onFirstCall().resolves(sender);
            findOneUser.onSecondCall().resolves(recipient);
            stubModel(sandbox, KudoEligibleGiver, 'findOne', eligible);
            stubModel(sandbox, Kudo, 'insertOne', { insertedId: new ObjectId(), acknowledged: true });

            const ctx = buildMockCtx({ telegramUserId: 500, isGroupChat: false, args: ['@DmRecipient', 'Great'] });
            await kudoCmd.handler(ctx);

            expect((ctx.bot.sendMessage as sinon.SinonStub).calledOnce).toBe(true);
            expect((ctx.bot.sendMessage as sinon.SinonStub).firstCall.args[0]).toBe(600);
        });

        it('should enforce rate limit', async () => {
            const sender = mockUser({ telegramUserId: 300, jiraUserId: 'JIRA-3', name: 'RateLimitUser' });
            const recipient = mockUser({ telegramUserId: 400, jiraUserId: 'JIRA-4', name: 'Other' });
            const eligible = mockEligibleGiver({ userId: sender._id.toHexString() });

            const findOneUser = stubModel(sandbox, User, 'findOne', null);
            findOneUser.resolves(null);
            findOneUser.onFirstCall().resolves(sender);
            findOneUser.onSecondCall().resolves(recipient);
            stubModel(sandbox, KudoEligibleGiver, 'findOne', eligible);
            stubModel(sandbox, Kudo, 'insertOne', { insertedId: new ObjectId(), acknowledged: true });

            const ctx1 = buildMockCtx({ telegramUserId: 300, args: ['@Other', 'first'] });
            await kudoCmd.handler(ctx1);
            expect((ctx1.reply as sinon.SinonStub).firstCall.args[0]).toContain('Kudo sent');

            const ctx2 = buildMockCtx({ telegramUserId: 300, args: ['@Other', 'second'] });
            await kudoCmd.handler(ctx2);
            expect((ctx2.reply as sinon.SinonStub).firstCall.args[0]).toContain('wait a minute');
        });
    });

    describe('link.cmd', () => {
        it('should reply already linked when user exists', async () => {
            const user = mockUser({ telegramUserId: 100, name: 'Alice' });
            stubModel(sandbox, User, 'findOne', user);
            const ctx = buildMockCtx({ telegramUserId: 100 });
            await linkCmd.handler(ctx);
            expect((ctx.reply as sinon.SinonStub).firstCall.args[0]).toContain('already linked');
            expect((ctx.reply as sinon.SinonStub).firstCall.args[0]).toContain('Alice');
        });

        it('should generate OTP link when user not linked', async () => {
            stubModel(sandbox, User, 'findOne', null);
            const insertStub = stubModel(sandbox, OTP, 'insertOne', { insertedId: new ObjectId(), acknowledged: true });
            const ctx = buildMockCtx({ telegramUserId: 100 });
            await linkCmd.handler(ctx);

            expect(insertStub.calledOnce).toBe(true);
            const otpDoc = insertStub.firstCall.args[0];
            expect(otpDoc.type).toBe('TELEGRAM_LINK');
            expect(otpDoc.telegramUserId).toBe(100);
            expect(otpDoc.otp).toHaveLength(32);
            expect((ctx.reply as sinon.SinonStub).firstCall.args[0]).toContain('telegram-link');
            expect((ctx.reply as sinon.SinonStub).firstCall.args[0]).toContain('5 minutes');
        });
    });

    describe('unlink.cmd', () => {
        it('should unlink successfully when linked', async () => {
            stubModel(sandbox, User, 'updateOne', { modifiedCount: 1, matchedCount: 1, acknowledged: true, upsertedCount: 0, upsertedId: null });
            const ctx = buildMockCtx({ telegramUserId: 100 });
            await unlinkCmd.handler(ctx);
            expect((ctx.reply as sinon.SinonStub).firstCall.args[0]).toContain('unlinked');
        });

        it('should reply not linked when no account found', async () => {
            stubModel(sandbox, User, 'updateOne', { modifiedCount: 0, matchedCount: 0, acknowledged: true, upsertedCount: 0, upsertedId: null });
            const ctx = buildMockCtx({ telegramUserId: 100 });
            await unlinkCmd.handler(ctx);
            expect((ctx.reply as sinon.SinonStub).firstCall.args[0]).toContain('not linked');
        });
    });

    describe('register.cmd', () => {
        it('should reject in DM', async () => {
            const ctx = buildMockCtx({ isGroupChat: false });
            await registerCmd.handler(ctx);
            expect((ctx.reply as sinon.SinonStub).firstCall.args[0]).toContain('group chat');
        });

        it('should reject non-admin', async () => {
            const user = mockUser({ telegramUserId: 100 });
            stubModel(sandbox, User, 'findOne', user);
            const ctx = buildMockCtx({ telegramUserId: 100, isGroupChat: true });
            await registerCmd.handler(ctx);
            expect((ctx.reply as sinon.SinonStub).firstCall.args[0]).toContain('linked admin');
        });

        it('should register group successfully', async () => {
            const admin = mockAdmin({ telegramUserId: 100 });
            stubModel(sandbox, User, 'findOne', admin);
            stubModel(sandbox, AppConfig, 'findOne', null);
            const updateStub = stubModel(sandbox, AppConfig, 'updateOne', { modifiedCount: 1, matchedCount: 1, acknowledged: true, upsertedCount: 0, upsertedId: null });

            const ctx = buildMockCtx({ telegramUserId: 100, chatId: 999, isGroupChat: true });
            await registerCmd.handler(ctx);

            expect(updateStub.calledOnce).toBe(true);
            const updateArgs = updateStub.firstCall.args;
            expect(updateArgs[0]).toEqual({ key: 'telegram_registered_groups' });
            const groups = updateArgs[1].$set.value;
            expect(groups).toHaveLength(1);
            expect(groups[0].chatId).toBe(999);
            expect((ctx.reply as sinon.SinonStub).firstCall.args[0]).toContain('registered');
        });

        it('should reject already registered group', async () => {
            const admin = mockAdmin({ telegramUserId: 100 });
            stubModel(sandbox, User, 'findOne', admin);
            stubModel(sandbox, AppConfig, 'findOne', { key: 'telegram_registered_groups', value: [{ chatId: 999 }] });

            const ctx = buildMockCtx({ telegramUserId: 100, chatId: 999, isGroupChat: true });
            await registerCmd.handler(ctx);
            expect((ctx.reply as sinon.SinonStub).firstCall.args[0]).toContain('already registered');
        });
    });

    describe('unregister.cmd', () => {
        it('should reject in DM', async () => {
            const ctx = buildMockCtx({ isGroupChat: false });
            await unregisterCmd.handler(ctx);
            expect((ctx.reply as sinon.SinonStub).firstCall.args[0]).toContain('group chat');
        });

        it('should unregister group successfully', async () => {
            const admin = mockAdmin({ telegramUserId: 100 });
            stubModel(sandbox, User, 'findOne', admin);
            stubModel(sandbox, AppConfig, 'findOne', { key: 'telegram_registered_groups', value: [{ chatId: 999 }, { chatId: 888 }] });
            const updateStub = stubModel(sandbox, AppConfig, 'updateOne', { modifiedCount: 1, matchedCount: 1, acknowledged: true, upsertedCount: 0, upsertedId: null });

            const ctx = buildMockCtx({ telegramUserId: 100, chatId: 999, isGroupChat: true });
            await unregisterCmd.handler(ctx);

            expect(updateStub.calledOnce).toBe(true);
            const filtered = updateStub.firstCall.args[1].$set.value;
            expect(filtered).toHaveLength(1);
            expect(filtered[0].chatId).toBe(888);
            expect((ctx.reply as sinon.SinonStub).firstCall.args[0]).toContain('unregistered');
        });

        it('should reply not registered when group not found', async () => {
            const admin = mockAdmin({ telegramUserId: 100 });
            stubModel(sandbox, User, 'findOne', admin);
            stubModel(sandbox, AppConfig, 'findOne', { key: 'telegram_registered_groups', value: [{ chatId: 888 }] });

            const ctx = buildMockCtx({ telegramUserId: 100, chatId: 999, isGroupChat: true });
            await unregisterCmd.handler(ctx);
            expect((ctx.reply as sinon.SinonStub).firstCall.args[0]).toContain('not registered');
        });
    });

    describe('leaderboard.cmd', () => {
        it('should reject unlinked user', async () => {
            stubModel(sandbox, User, 'findOne', null);
            const ctx = buildMockCtx({ telegramUserId: 100 });
            await leaderboardCmd.handler(ctx);
            expect((ctx.reply as sinon.SinonStub).firstCall.args[0]).toContain('not linked');
        });

        it('should show leaderboard with scored users', async () => {
            const sender = mockUser({ telegramUserId: 100, jiraUserId: 'JIRA-1' });
            const kudos = [
                mockKudo({ fromUserId: 'JIRA-1', toUserId: 'JIRA-2', createdAt: Date.now() }),
                mockKudo({ fromUserId: 'JIRA-1', toUserId: 'JIRA-2', createdAt: Date.now() }),
                mockKudo({ fromUserId: 'JIRA-3', toUserId: 'JIRA-2', createdAt: Date.now() }),
            ];
            const users = [
                mockUser({ jiraUserId: 'JIRA-2', name: 'TopUser' }),
            ];

            const findOneStub = stubModel(sandbox, User, 'findOne', sender);
            const kudoFindStub = stubModel(sandbox, Kudo, 'find', kudos);
            const userFindStub = stubModel(sandbox, User, 'find', users);

            const ctx = buildMockCtx({ telegramUserId: 100 });
            await leaderboardCmd.handler(ctx);

            const reply = (ctx.reply as sinon.SinonStub).firstCall.args[0];
            expect(reply).toContain('Leaderboard');
            expect(reply).toContain('TopUser');
        });

        it('should show no kudos message when empty', async () => {
            const sender = mockUser({ telegramUserId: 100, jiraUserId: 'JIRA-1' });
            stubModel(sandbox, User, 'findOne', sender);
            stubModel(sandbox, Kudo, 'find', []);
            stubModel(sandbox, User, 'find', []);

            const ctx = buildMockCtx({ telegramUserId: 100 });
            await leaderboardCmd.handler(ctx);
            expect((ctx.reply as sinon.SinonStub).firstCall.args[0]).toContain('No kudos');
        });
    });

    describe('mykudos.cmd', () => {
        it('should reject unlinked user', async () => {
            stubModel(sandbox, User, 'findOne', null);
            const ctx = buildMockCtx({ telegramUserId: 100 });
            await mykudosCmd.handler(ctx);
            expect((ctx.reply as sinon.SinonStub).firstCall.args[0]).toContain('not linked');
        });

        it('should show kudo summary', async () => {
            const sender = mockUser({ telegramUserId: 100, jiraUserId: 'JIRA-1' });
            const received = [
                mockKudo({ toUserId: 'JIRA-1', fromUserId: 'JIRA-2', createdAt: Date.now() }),
                mockKudo({ toUserId: 'JIRA-1', fromUserId: 'JIRA-3', createdAt: Date.now() }),
            ];
            const given = [
                mockKudo({ fromUserId: 'JIRA-1', toUserId: 'JIRA-4', createdAt: Date.now() }),
            ];
            const allKudos = [...received, ...given];

            stubModel(sandbox, User, 'findOne', sender);
            stubModel(sandbox, Kudo, 'find', allKudos);

            const ctx = buildMockCtx({ telegramUserId: 100, args: ['30'] });
            await mykudosCmd.handler(ctx);

            const reply = (ctx.reply as sinon.SinonStub).firstCall.args[0];
            expect(reply).toContain('Your Kudos');
            expect(reply).toContain('last 30 days');
        });
    });

    describe('help.cmd', () => {
        it('should list all commands', async () => {
            const ctx = buildMockCtx();
            await helpCmd.handler(ctx);
            const reply = (ctx.reply as sinon.SinonStub).firstCall.args[0];
            expect(reply).toContain('/kudo');
            expect(reply).toContain('/mykudos');
            expect(reply).toContain('/leaderboard');
            expect(reply).toContain('/link');
            expect(reply).toContain('/unlink');
            expect(reply).toContain('/help');
            expect(reply).toContain('/issue');
            expect(reply).toContain('/myissues');
            expect(reply).toContain('/mystats');
        });
    });

    describe('TelegramDispatcher', () => {
        it('should ignore non-command messages', async () => {
            const { TelegramDispatcher } = await import('../../../../serv/telegram/dispatcher');
            const mockBot = {
                on: sinon.stub(),
                sendMessage: sinon.stub().resolves({}),
            } as any;

            const dispatcher = new TelegramDispatcher(mockBot);
            await dispatcher.init();

            const messageHandler = mockBot.on.firstCall.args[1];
            const msg = { text: 'just a normal message', chat: { id: 1 }, from: { id: 1 } } as any;
            await messageHandler(msg);

            expect(mockBot.sendMessage.called).toBe(false);
        });

        it('should route to correct command handler', async () => {
            const { TelegramDispatcher } = await import('../../../../serv/telegram/dispatcher');
            const mockBot = {
                on: sinon.stub(),
                sendMessage: sinon.stub().resolves({}),
            } as any;

            const dispatcher = new TelegramDispatcher(mockBot);
            await dispatcher.init();

            const messageHandler = mockBot.on.firstCall.args[1];
            const msg = { text: '/help', chat: { id: 1, type: 'private' }, from: { id: 1 } } as any;
            await messageHandler(msg);

            expect(mockBot.sendMessage.calledOnce).toBe(true);
            expect(mockBot.sendMessage.firstCall.args[1]).toContain('Kudo Bot Commands');
        });

        it('should reply with reply_to_message_id in group chats', async () => {
            const { TelegramDispatcher } = await import('../../../../serv/telegram/dispatcher');
            const mockBot = {
                on: sinon.stub(),
                sendMessage: sinon.stub().resolves({}),
            } as any;

            stubModel(sandbox, AppConfig, 'findOne', { key: 'telegram_registered_groups', value: [{ chatId: 42 }] });

            const dispatcher = new TelegramDispatcher(mockBot);
            await dispatcher.init();

            const messageHandler = mockBot.on.firstCall.args[1];
            const msg = { text: '/help', message_id: 55, chat: { id: 42, type: 'group' }, from: { id: 1 } } as any;
            await messageHandler(msg);

            expect(mockBot.sendMessage.calledOnce).toBe(true);
            expect(mockBot.sendMessage.firstCall.args[2]).toEqual({ reply_to_message_id: 55 });
        });
    });
});
