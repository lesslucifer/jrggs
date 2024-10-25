import { GQLField, GQLGlobal, GQLIdenticalMapping, GQLMapper, GQLModel, GQLObject, GQLQuery, GQLResolver, GQLU } from "gql-ts";
import { USER_ROLE } from "../glob/cf";
import hera from "../utils/hera";
import User, { IUser } from "./user.mongo";

@GQLObject("user")
export class GQLUser extends GQLModel<IUser, GQLUser> {
    @GQLField()
    _id: string;

    @GQLField()
    name: string;

    @GQLField()
    email: string;

    @GQLField({autoSelect: true})
    @GQLIdenticalMapping()
    roles: USER_ROLE[];

    @GQLField()
    isBlocked: boolean;

    static get DefaultSelect() {
        return { _id: true }
    }

    @GQLResolver({ matches: GQLU.byFields([], ['_id', 'email', 'roles', 'isBlocked']) })
    static async rootResolve(query: GQLQuery) {
        const ids = query.filter.get('_id').batch<string>().map(id => hera.mObjId(id, false));
        const emails = query.filter.get('email').batch<string>();
        const roles = query.filter.get('roles').batch<string>();
        const isBlocked = query.filter.get('isBlocked').first();
        const q = GQLU.notEmpty({
            _id: hera.mongoEqOrIn(ids),
            email: hera.mongoEqOrIn(emails),
            roles: hera.mongoEqOrIn(roles)
        });

        if (isBlocked != null) {
            q.isBlocked = GQLU.toBoolean(isBlocked) ? true : {$ne: true}
        }
        
        return await hera.gqlMongoQueryPagination(GQLUser, query, User, q, {defaultLimit: 50, maxLimit: 500})
    }
}

GQLGlobal.add(GQLUser)