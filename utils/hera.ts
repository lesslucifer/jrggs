import { ajvs } from 'ajvs-ts';
import * as express from 'express';
import * as glob from 'glob';
import { GQLBaseType, GQLU, IGQLModelClass } from 'gql-ts';
import { GQLGlobal } from 'gql-ts';
import { GQLQuery } from 'gql-ts';
import _ from 'lodash';
import * as mongodb from 'mongodb';

export type BoxedPromise<T> = T | Promise<T>;

export type ExpressAsyncRequestHandler = (req: express.Request, resp: express.Response) => Promise<any>;
export type ExpressSyncRequestHandler = (req: express.Request, resp: express.Response) => any;
export type ExpressRespHandler = (err?: any, data?: any) => void;
export type ExpressRespHandlerProvider = (req: express.Request, resp: express.Response) => ExpressRespHandler;

export interface AsyncMapIterator<T, R> {
    (elem: T, idx: number): Promise<R>
}

export interface IGQLMGQueryPaginationOpts {
    defaultLimit?: number;
    maxLimit?: number;
}

export interface IAppErrorResponse {
    message?: string;
    code?: string;
    params?: any;
}

export class AppApiResponse {

    constructor(success?: boolean) {
        this.success = success;
    }

    success: boolean;
    httpCode?: number;
    headers?: {[header: string]: string} = {}
    err?: IAppErrorResponse;
    data?: any;
}

export class AppLogicError extends Error {
    constructor(msg: string, public httpCode?: number, public params?: any) {
        super(msg); 
    }
}

export class BizLogicError extends Error {
    constructor(msg: string, public code?: number, public params?: any) {
        super(msg); 
    }
}

global['BizLogicError'] = BizLogicError
GQLU.Parsers.unshift((gql, spec, val) => {
    if (spec.rawType == GQLBaseType.STRING && mongodb.ObjectId.isValid(val)) {
        return `${val}`;
    }
});

export class Hera {
    static readonly INVALID_OBJECTID = mongodb.ObjectId.createFromTime(0)
    TimeTable = new Map<string, number>();
    ajv = ajvs();

    isValidEmailAddress(email: string) {
        var re = /^(([^<>()\[\]\\.,;:\s@"]+(\.[^<>()\[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;
        return re.test(email);
    }

    filterObj<V>(obj: Object, predicate: (k?: string, v?: V) => boolean) {
        return Object.keys(obj).filter(k => predicate(k, obj[k])).reduce((o, k) => {
            o[k] = obj[k];
            return o;
        }, {});
    }

    mapObj<V1, V2>(obj: Object, iterator: (k?: string, v?: V1) => V2) {
        return Object.keys(obj).reduce((o, k) => {
            o[k] = iterator(k, obj[k]);
            return o;
        }, <any>{});
    }

    notEmpty(data: any, isEmpty: (any)  => boolean = this.isEmpty, deep = false) {
        if (_.isArray(data)) {
            const filteredData = data.filter(d => !isEmpty(d));
            if (deep) {
                return filteredData.map(d => this.notEmpty(d, isEmpty, true));
            }

            return filteredData;
        }
        else if (_.isObject(data)) {
            const filteredObj = this.filterObj(data, (k, v) => !isEmpty(v));
            if (deep) {
                return this.mapObj(filteredObj, (k, v) => this.notEmpty(v, isEmpty, true));
            }

            return filteredObj;
        }

        return data;
    }

    get urlRegEx() {
        return /^([a-z]+)\:\/\/[-a-zA-Z0-9@:%._\+~#=]{2,256}\.[a-z]{2,6}\b([-a-zA-Z0-9@:%_\+.~#?&//=]*)$/;
    }

    isEmpty(obj?: any): boolean {
        return  ((obj == null || _.isNaN(obj) || obj === false) ||
                (_.isString(obj) && obj.length == 0) ||
                ((obj instanceof Array) && obj.length == 0) ||
                ((obj instanceof Object) && Object.keys(obj).length == 0));
    }

    isURL(s: string) {
        return s.match(this.urlRegEx).length > 0;
    }

    parseInt(val: any, radix?: number, defaultVal?: number): number {
        const n = parseInt(val, radix);
        if (isNaN(n)) {
            return defaultVal!;
        }

        return n;
    }

    parseFloat(val: any, defaultVal?: number): number {
        const x = parseFloat(val);
        if (isNaN(x)) {
            return defaultVal!;
        }

        return x;
    }

    time(label: string) {
        this.TimeTable.set(label, new Date().valueOf());
    }

    timeEnd(label: string, logger: any = console) {
        const now = new Date().valueOf();
        const unix = this.TimeTable.get(label);
        this.TimeTable.delete(label);
        if (!unix) return;

        logger.info(`${label}: ${now - unix}ms`)        
    }

    async unboxPromise<T>(val: BoxedPromise<T>) {
        return (val instanceof Promise) ? await val : val;
    }
    
    arrToMap<T, K, V>(arr: ArrayLike<T>, key: (t: T, idx?: number) => K, value: (t: T, idx?: number) => V): Map<K, V> {
        const map = new Map<K, V>();
        for (let i = 0; i < arr.length; ++i) {
            map.set(key(arr[i], i), value(arr[i], i));
        }

        return map;
    }

    sleep(timeout: number = 0) {
        return new Promise<void>((res) => setTimeout(res, timeout));
    }

    extractString(str: string, from: string, to: string, withMarks: boolean = false) {
        if (!str) return undefined;
        
        let start = str.indexOf(from);
        if (start < 0) return undefined;

        let end = str.indexOf(to, start + from.length);
        if (end < 0) return undefined;

        if (!withMarks) {
            start = start + from.length;
            end = end - to.length;
        }
        
        return str.substr(start, end - start + 1);
    }

    async waitFor(f: () => BoxedPromise<boolean>, timeout: number = 30000, interval: number = 100) {
        const begin = new Date().valueOf();
        const timeOutAt = begin + timeout;
        while (true) {
            const result = await this.unboxPromise(f());
            if (result == true) return true;

            const now = new Date().valueOf();
            if (now >= timeOutAt) {
                throw new Error(`Waiting timed-out! ${timeout} ms passed!`);
            }

            await this.sleep(interval);
        }
    }

    glob(pattern: string): Promise<string[]> {
        return new Promise<string[]>((res, rej) => {
            glob(pattern, (err, matches) => err ? rej(err) : res(matches));
        })
    }

    async retry<T>(f: () => Promise<T>, n: number, delay: number = 0): Promise<T> {
        return this._retry(f, n, delay, []);
    }

    private async _retry<T>(f: () => Promise<T>, n: number, delay: number = 0, errs: Error[]) {
        if (n <= 0) {
            throw new Error(`Retry error! Errors:\n ${errs.map(e => `${e}`).join('\n')}`);
        }

        try {
            return await f();
        }
        catch (err) {
            await this.sleep(delay);
            errs.push(err);
            return await this._retry(f, n - 1, delay, errs);
        }
    }

    mongoEqOrIn(val: any) {
        if (_.isArray(val)) {
            if (val.length == 0) return undefined;
            if (val.length == 1) return _.first(val);
            return {$in: val};
        }

        return val;
    }

    arrToObj<T, V>(arr: T[], keyMap: (t: T, idx: number) => string, valMap: (t: T, idx: number) => V): {[k: string]: V} {
        if (!arr) return {};
        const ret = {};
        for (let i = 0; i < arr.length; ++i) {
            ret[keyMap(arr[i], i)] = valMap(arr[i], i);
        }
        
        return ret;
    }

    async asyncSeqMap<T, R>(arr: T[], fn: AsyncMapIterator<T, R>): Promise<(R | Error)[]> {
        const result: (R | Error)[] = []
        for (let i = 0; i < arr.length; ++i) {
            const elem = arr[i]
            try {
                result.push(await fn(elem, i))
            }
            catch (err) {
                result.push(err)
            }
        }

        return result
    }

    async asyncBatchMap<T, R>(arr: T[], fn: AsyncMapIterator<T, R>, batchSize = 10): Promise<(R | Error)[]> {
        const result = []
        const chunks = _.chunk(arr, batchSize)
        let chIdx = 0
        for (const chunk of chunks) {
            result.push(...await Promise.all(chunk.map(async (elem, idx) => {
                try {
                    return await fn(elem, chIdx + idx)
                }
                catch (err) {
                    return err
                }
            })))
    
            chIdx += chunk.length
        }
    
        return result
    }

    isPromise(o: any) {
        return _.isFunction(o?.then)
    }

    toJSON(data: any) {
        if (data == null) return;
        try {
            return JSON.parse(data);
        }
        catch (err) {
            return null;
        }
    }

    timeoutPromise(timeout: number, resolver: Function) {
        return new Promise((res, rej) => {
            let isResolved = false
            let timer = setTimeout(() => {
                if (isResolved) return
                isResolved = true
                rej(new Error(`Timed out - Promise run for too long (${timeout})ms`))
            }, timeout)

            resolver((arg: any) => {
                if (isResolved) return
                clearTimeout(timer)
                isResolved = true
                return res(arg)
            }, (err: any) => {
                if (isResolved) return
                clearTimeout(timer)
                isResolved = true
                return rej(err)
            })
        })
    }

    isBooleanString(val: any) {
        if (val === null || val === undefined) return false;
        if (val === '') return false;
        return true
    }
    
    mObjId(id: string, throws = true) {
        try {
            return new mongodb.ObjectId(id);
        }
        catch (err) {
            if (throws) throw err
            return Hera.INVALID_OBJECTID
        }
    }

    gqlMongoQueryPagination<T>(gqlModel: IGQLModelClass<any, any>, gqlQuery: GQLQuery<any>, mgCollection: mongodb.Collection<T>, mgQuery: any, opts?: IGQLMGQueryPaginationOpts): Promise<Partial<T>[]> {
        const gql = GQLGlobal;
        const spec = GQLGlobal.get(gqlModel);
        _.keys(gqlQuery.pagination.from)
            .map(k => spec.getKey(k))
            .filter(ks => ks != null && !_.isEmpty(gqlQuery.pagination.from[ks.key]))
            .forEach(ks => {
                const val = gqlQuery.pagination.from[ks.key]
                const qVal = mongodb.ObjectId.isValid(val) ? new mongodb.ObjectId(val) : GQLU.gqlParse(gql, ks, val)
                _.set(mgQuery, `${ks.key}.$gt`, qVal)
            })

        _.keys(gqlQuery.pagination.to)
            .map(k => spec.getKey(k))
            .filter(ks => ks != null && !_.isEmpty(gqlQuery.pagination.to[ks.key]))
            .forEach(ks => {
                const val = gqlQuery.pagination.to[ks.key]
                const qVal = mongodb.ObjectId.isValid(val) ? new mongodb.ObjectId(val) : GQLU.gqlParse(gql, ks, val)
                _.set(mgQuery, `${ks.key}.$lt`, qVal)
            })

        const cursor = mgCollection.find(mgQuery).project<Partial<T>>(gqlQuery.QueryFields);

        const sort = gqlQuery.sort;
        if (!hera.isEmpty(sort)) {
            cursor.sort(this.arrToObj(sort.fields, f => f.field as string, f => f.OrderNumber));
        }

        const defLimit = (opts && opts.defaultLimit) || 100;
        const maxLimit = (opts && opts.maxLimit) || 1000;
        cursor.limit(Math.min(hera.parseInt(gqlQuery.pagination.limit, undefined, defLimit), maxLimit));
        return cursor.toArray()
    }
}

export const hera = new Hera();
export default hera;