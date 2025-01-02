import _ from 'lodash';

import * as C from '../glob/cf';
import ERR from '../glob/err';
import hera, { AppLogicError } from '../utils/hera';

// Import models here

// Import services here
import { Body, ExpressRouter, GET, POST, PUT, Params, Query } from 'express-router-ts';
import { GQLFieldFilter, GQLGlobal, GQLQuery, GQLU } from 'gql-ts';
import { ObjectId } from 'mongodb';
import { USER_ROLE } from '../glob/cf';
import { UserServ } from '../serv/user';
import { GQLUser } from '../models/user.gql';
import User, { IUser } from '../models/user.mongo';
import AuthServ from '../serv/auth';
import { Caller, ValidBody } from '../utils/decors';

export class UserRouter extends ExpressRouter {

    @AuthServ.authUser(USER_ROLE.USER)
    @GET({ path: '/me' })
    async getMyProfile(@Caller() user: IUser, @Query() query: any) {
        const q = GQLGlobal.queryFromHttpQuery(query, GQLUser);
        GQLU.whiteListFilter(q);
        q.filter.add(new GQLFieldFilter('_id', user._id.toHexString()));
        q.options.one = true

        const me = await q.resolve() as GQLUser;
        return me;
    }

    @AuthServ.authUser(USER_ROLE.ADMIN)
    @GET({ path: '/' })
    async getUserAdmin(@Caller() user: IUser, @Query() query: any) {
        const q = GQLGlobal.queryFromHttpQuery(query, GQLUser);
        GQLU.whiteListFilter(q, '_id', 'phone', 'roles', 'isBlocked');

        return await q.resolve();
    }
    
    @AuthServ.authUser(USER_ROLE.ADMIN)
    @ValidBody({
        '+@id': 'string',
        '+@newPassword': 'string|len>=6',
        '++': false
    })
    @PUT({ path: '/password' })
    async updatePasswordAdmin(@Body('id') id: string, @Body('newPassword') newPassword: string) {
        const uid = new ObjectId(id);

        const result = await UserServ.updatePassword(uid, newPassword);
        return result;
    }

    @AuthServ.authUser(USER_ROLE.USER)
    @ValidBody({
        '@name': 'string',
        '++': false
    })
    @PUT({ path: '/me' })
    async updateMyProfile(@Caller() user: IUser, @Body() body: Partial<IAddUpdateUserBody>) {
        const update = GQLU.notEmpty(body);

        if (!hera.isEmpty(update)) {
            await User.updateOne({ _id: user._id }, { $set: update });
        }
    }

    @AuthServ.authUser()
    @ValidBody({
        '+@oldPassword': 'string',
        '+@newPassword': 'string|len>=6',
        '++': false
    })
    @PUT({ path: '/me/password' })
    async updatePassword(@Caller() user: IUser, @Body('oldPassword') oldPass: string, @Body('newPassword') newPass: string) {
        const isOldPassValid = await UserServ.isValidPassword(user._id, oldPass);
        if (!isOldPassValid) {
            throw new AppLogicError('Cannot update password! The old password is not correct', 400, ERR.INVALID_FORMAT);
        }

        await UserServ.updatePassword(user._id, newPass);
    }

    static addUserBodySchema = {
        '+@name': 'string',
        '+@email': 'string',
        '+@password': 'string|>=8',
        '+[]roles': { enum: _.values(C.USER_ROLE) }
    }
    async addUserAsAdmin(user: IUser, body: IAddUpdateUserBody) {
        const newUserId = await UserServ.registerNewUser({
            name: body.name,
            email: body.email,
            roles: body.roles,
            password: body.password
        })

        return {
            _id: newUserId
        }
    }

    @AuthServ.authUser(USER_ROLE.ADMIN,)
    @ValidBody(UserRouter.addUserBodySchema)
    @POST({ path: '/' })
    async addUserAdmin(@Caller() user: IUser, @Body() body: IAddUpdateUserBody) {
        return await this.addUserAsAdmin(user, body)
    }

    @AuthServ.authSysAdmin()
    @ValidBody(UserRouter.addUserBodySchema)
    @POST({ path: '/' })
    async addUserSystem(@Body() body: IAddUpdateUserBody) {
        return await this.addUserAsAdmin(null, body)
    }

    @AuthServ.authUser(USER_ROLE.ADMIN,)
    @ValidBody({
        '@name': 'string',
        '@email': 'string',
        '@isBlocked': 'boolean',
        '[]roles': { enum: _.values(C.USER_ROLE) },
        '++': false
    })
    @PUT({ path: '/:id' })
    async updateUserInfo(@Body() body: Partial<IAddUpdateUserBody>, @Params('id') id: string) {
        const user = await UserServ.getUser(id);

        if (hera.isEmpty(user)) {
            throw new AppLogicError('Can not found user! User not found', 400, ERR.OBJECT_NOT_FOUND);
        }

        const update = GQLU.notEmpty(body);

        if (!hera.isEmpty(update)) {
            await User.updateOne({ _id: user._id }, { $set: update });
        }
    }

    @AuthServ.authUser(USER_ROLE.ADMIN)
    @PUT({ path: '/:id/del' })
    async blockUser(@Params('id') _id: string) {
        const id: ObjectId = hera.mObjId(_id);
        const user: IUser = await User.findOne({ _id: id });
        if (hera.isEmpty(user)) {
            throw new AppLogicError('Can not found user! user not found', 400, ERR.OBJECT_NOT_FOUND);
        }
        await User.updateOne({ _id: id }, { $set: { isBlocked: true } });
    }

    @AuthServ.authUser(USER_ROLE.ADMIN)
    @PUT({ path: '/:id/unblock' })
    async unBlockUser(@Params('id') _id: string) {
        const id: ObjectId = hera.mObjId(_id);
        const updateResult = await User.updateOne({ _id: id }, { $set: { isBlocked: false } });
        if (updateResult.modifiedCount == 0) {
            throw new AppLogicError('Can not unblock user! user not found', 400, ERR.OBJECT_NOT_FOUND);
        }
    }
}

interface IAddUpdateUserBody {
    name: string;
    email: string;
    password: string;
    roles: USER_ROLE[];
}

export default new UserRouter();