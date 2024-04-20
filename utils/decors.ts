import { addMiddlewareDecor, argMapperDecor, ExpressRouter, pushDoc, ResponseHandler, SetDoc, setDoc, updateDocument } from 'express-router-ts';
import { AppLogicError } from './hera';
import * as ajv2 from './ajv2';
import Ajv from 'ajv';
import _ from 'lodash';
import express = require('express');
import { GQL, GQLGlobal } from 'gql-ts';

const ajv = new Ajv();

export function ValidBody(schema: any, sample: any = undefined) {
    const ajvSchema = ajv2.craft(schema)
    const validator = ajv.compile(ajvSchema);

    if (sample !== undefined && !validator(sample)) {
        console.warn(`Invalid sample ${JSON.stringify(sample)} for schema ${JSON.stringify(schema)}; Errors=${JSON.stringify(validator.errors)}`)
    }

    return addMiddlewareDecor(async req => {
        if (!validator(req.body)) throw new AppLogicError('Invalid request body!', 400, validator.errors);
    }, setDoc('requestBody', {
        content: {
            'application/json': {
                schema: ajvSchema,
                ...(sample !== undefined ? {example: sample} : {})
            }
        }
    }))
}

export function MultipartFormData(schema: object) {
    const ajvSchema = ajv2.craft(schema)
    return SetDoc('requestBody', {
        content: {
            'multipart/form-data': {
                schema: ajvSchema
            }
        }
    })
}

export function Sess(arg?: any) {
    const mapper = _.isString(arg) ? req => _.get(req.session, arg) : (_.isFunction(arg) ? req => arg(req.session) : req => req.session);
    return argMapperDecor(mapper);
}

export function Caller() {
    return Sess('user');
}

export function SessArea() {
    return Sess('area');
}

export function RouteIf(condiditon: (req: express.Request) => Promise<boolean> | boolean) {
    return addMiddlewareDecor(async req => {
        let isOk = await Promise.resolve(condiditon(req));
        if (!isOk) throw ExpressRouter.NEXT;
    })
}

export function formatResponseSchema(schema: any, rawAjv: boolean) {
    return ajv2.craft({
        '@success': 'boolean',
        '@err': {
            '@message': 'string'
        },
        ...schema && (rawAjv ? {'data': schema} : {'@data': schema})
    })
}

export interface IDocResponseOptions {
    status?: number
    contentType?: string
    fields?: any
    rawAjv?: true
}

export function DocResponse(schema: any, opts?: IDocResponseOptions) {
    const status = opts?.status ?? 200
    const contentType = opts?.status ?? 'application/json'
    const extra = opts?.fields ?? {}
    let rawAjv = opts?.rawAjv === true

    if (GQLGlobal.get(schema)) {
        const gqlModelSpec = GQLGlobal.get(schema)
        schema = {
            '$ref': gqlModelSpec.schemas?.ref ?? `#/components/schemas/${gqlModelSpec.name}`
        }
        rawAjv = true
    }
    else if (_.isString(schema)) {
        schema = {
            '$ref': schema
        }
        rawAjv = true
    }

    return updateDocument(doc => _.setWith(doc, ['responses', status.toString(), 'content', contentType], {
        schema: formatResponseSchema(schema, rawAjv),
        ...extra
    }, Object))
}

export function DocSuccessResponse() {
    return DocResponse(null)
}

export interface IParameterDoc {
    name: string;
    in: 'query' | 'path';
    format?: string;
    description?: string;
    required?: true;
    example?: string;
}

export type ParameterDoc = IParameterDoc | string

function addDocParams(doc: object, param: ParameterDoc) {
    pushDoc('parameters', {
        ...{description: '', schema: {type: 'string'}},
        ...param as object
    })(doc)
}

export function DocQueries(examples: {[q: string]: string}) {
    return updateDocument(doc => {
        const queries = _.get(doc, 'parameters') ?? []
        if (_.isEmpty(queries)) _.set(doc, 'parameters', queries)
        
        Object.keys(examples).forEach(q => {
            const query = queries.find(qq => _.get(qq, 'name') == q && _.get(qq, 'in') == 'query');
            if (query) {
                _.set(query, 'example', examples[q])
            }
            else {
                queries.push({
                    name: q,
                    schema: {type: 'string'},
                    example: examples[q],
                    in: 'query',
                    required: false
                })
            }
        })
    })
}

export function DocGQLResponse(type: any, queryFields: {[field: string]: string} = {}, isSingle = false) {
    const spec = GQLGlobal.get(type)
    if (!spec) throw new Error(`Cannot get GQL Type ${type}`)
    const objSchema = {
        '$ref': spec.schemas?.ref ?? `#/components/schemas/${spec.name}`
    }

    const schema = isSingle ? objSchema : {
        'type': 'array',
        'items': objSchema
    }

    return updateDocument(doc => {
        _.setWith(doc, ['responses', '200', 'content', 'application/json', 'schema'], formatResponseSchema(schema, true), Object)

        _.set(doc, 'description', 'GQL Dynamic enpoint')
        
        addDocParams(doc, {
            name: '$fields',
            in: 'query',
            required: true,
            description: 'List of selected fields',
            example: '*'
        })
        
        // addDocParams(doc, {
        //     name: '$sort',
        //     in: 'query',
        //     description: 'Sorted result in order ($sort=<field>:ASC|DESC)'
        // })

        Object.keys(queryFields).forEach(qf => addDocParams(doc, {
            name: qf,
            example: queryFields[qf],
            in: 'query',
            description: 'Query field'
        }))
    })
}

export function DocParamsExample(examples: {[field: string]: string}) {
    return updateDocument(doc => {
        const params = _.get(doc, 'parameters') ?? []
        if (_.isEmpty(params)) _.set(doc, 'parameters', params)
        
        Object.keys(examples).forEach(p => {
            const param = params.find(pp => _.get(pp, 'name') == p && _.get(pp, 'in') == 'path');
            if (param) {
                _.set(param, 'example', examples[p])
            }
            else {
                params.push({
                    name: p,
                    schema: {type: 'string'},
                    example: examples[p],
                    in: 'path',
                    required: true
                })
            }
        })
    })
}

export function AsyncSafe(defaultValue?: any) {
    return (target: any, key: string, desc: PropertyDescriptor) => {
        const method = desc.value!
        desc.value = async (...args: any[]) => {
            try {
                return await method(...args)
            }
            catch (err) {
                console.error(err)
                return defaultValue
            }
        }
    }
}