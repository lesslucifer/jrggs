import { GQLField, GQLGlobal, GQLIdenticalMapping, GQLModel, GQLObject, GQLQuery, GQLResolver, GQLU } from 'gql-ts';
import hera from '../utils/hera';
import Kudo, { IKudo } from './kudo.mongo';

@GQLObject('kudo')
export class GQLKudo extends GQLModel<IKudo, GQLKudo> {
    @GQLField()
    _id: string;

    @GQLField()
    @GQLIdenticalMapping()
    fromUserId: string;

    @GQLField()
    @GQLIdenticalMapping()
    toUserId: string;

    @GQLField({ autoSelect: false })
    @GQLIdenticalMapping()
    message?: string;

    @GQLField()
    @GQLIdenticalMapping()
    createdAt: number;

    @GQLResolver({ matches: GQLU.byFields([], ['fromUserId', 'toUserId']) })
    static async rootResolve(query: GQLQuery<GQLKudo>) {
        const fromUserIds = query.filter.get('fromUserId').batch<string>();
        const toUserIds = query.filter.get('toUserId').batch<string>();

        const mongoQuery = GQLU.notEmpty({
            fromUserId: hera.mongoEqOrIn(fromUserIds),
            toUserId: hera.mongoEqOrIn(toUserIds),
        });

        return hera.gqlMongoQueryPagination(
            GQLKudo,
            query,
            Kudo,
            mongoQuery,
            { defaultLimit: 200, maxLimit: 1000 }
        );
    }
}

GQLGlobal.add(GQLKudo);
