import { Body, DELETE, ExpressRouter, GET, POST, Params, Query } from 'express-router-ts';
import { ObjectId } from 'mongodb';
import { USER_ROLE } from '../glob/cf';
import AuthServ from '../serv/auth';
import { Caller, ValidBody } from '../utils/decors';
import { AppLogicError } from '../utils/hera';
import Kudo, { IKudo, KudoCategory } from '../models/kudo.mongo';
import KudoEligibleGiver from '../models/kudo-eligible-giver.mongo';
import User, { IUser } from '../models/user.mongo';

class KudosRouter extends ExpressRouter {
    document = {
        tags: ['Kudos']
    }

    @AuthServ.authUser(USER_ROLE.USER)
    @ValidBody({
        '+toUserId': 'string',
        '+category': { enum: Object.values(KudoCategory) },
        '@message': 'string',
        '++': false
    })
    @POST({ path: '/' })
    async giveKudo(
        @Caller() caller: IUser,
        @Body('toUserId') toUserId: string,
        @Body('category') category: KudoCategory,
        @Body('message') message: string | undefined
    ): Promise<IKudo> {
        const callerId = caller._id.toHexString()

        if (callerId === toUserId) {
            throw new AppLogicError('Cannot give a kudo to yourself', 400)
        }

        const eligibleGiver = await KudoEligibleGiver.findOne({ userId: callerId })
        if (!eligibleGiver) {
            throw new AppLogicError('You are not eligible to give kudos', 403)
        }

        const recipient = await User.findOne({ _id: new ObjectId(toUserId) })
        if (!recipient) {
            throw new AppLogicError('Recipient user not found', 400)
        }

        const kudo: Omit<IKudo, '_id'> = {
            fromUserId: callerId,
            toUserId,
            category,
            message,
            createdAt: Date.now()
        }

        const result = await Kudo.insertOne(kudo as IKudo)
        return { ...kudo, _id: result.insertedId } as IKudo
    }

    @AuthServ.authUser(USER_ROLE.USER)
    @GET({ path: '/' })
    async listKudos(@Query() query: any): Promise<IKudo[]> {
        const filter: any = {}

        if (query.startDate && query.endDate) {
            const startTs = new Date(query.startDate).getTime()
            const endTs = new Date(query.endDate).getTime()
            if (isNaN(startTs) || isNaN(endTs)) {
                throw new AppLogicError('Invalid date format', 400)
            }
            filter.createdAt = { $gte: startTs, $lte: endTs }
        }

        if (query.fromUserId) filter.fromUserId = query.fromUserId
        if (query.toUserId) filter.toUserId = query.toUserId
        if (query.category) filter.category = query.category

        return Kudo.find(filter).sort({ createdAt: -1 }).toArray()
    }

    @AuthServ.authUser(USER_ROLE.USER)
    @GET({ path: '/eligible-givers/me' })
    async checkMyEligibility(@Caller() caller: IUser): Promise<{ eligible: boolean }> {
        const callerId = caller._id.toHexString()
        const record = await KudoEligibleGiver.findOne({ userId: callerId })
        return { eligible: !!record }
    }

    @AuthServ.authUser(USER_ROLE.ADMIN)
    @GET({ path: '/eligible-givers' })
    async listEligibleGivers() {
        return KudoEligibleGiver.find({}).toArray()
    }

    @AuthServ.authUser(USER_ROLE.ADMIN)
    @ValidBody({
        '+userId': 'string',
        '++': false
    })
    @POST({ path: '/eligible-givers' })
    async addEligibleGiver(@Caller() caller: IUser, @Body('userId') userId: string) {
        const user = await User.findOne({ _id: new ObjectId(userId) })
        if (!user) {
            throw new AppLogicError('User not found', 400)
        }

        const callerId = caller._id.toHexString()
        await KudoEligibleGiver.updateOne(
            { userId },
            { $set: { userId, addedBy: callerId, addedAt: Date.now() } },
            { upsert: true }
        )

        return KudoEligibleGiver.findOne({ userId })
    }

    @AuthServ.authUser(USER_ROLE.ADMIN)
    @DELETE({ path: '/eligible-givers/:userId' })
    async removeEligibleGiver(@Params('userId') userId: string) {
        const result = await KudoEligibleGiver.deleteOne({ userId })
        if (result.deletedCount === 0) {
            throw new AppLogicError('Eligible giver not found', 400)
        }
    }
}

export default new KudosRouter();
