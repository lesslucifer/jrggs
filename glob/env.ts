import _ from 'lodash';
import hera from '../utils/hera';
import { config as configureDotenv } from 'dotenv';
import { ajvs } from 'ajvs-ts';
import path from 'path'

const ajv = ajvs()

export interface ENV_DB_CONFIG {
    MONGO_CONNECTION: string;
    MONGO_DB: string;
    MONGO_OPTIONS: any;
}

const ajvEnvDbConfig = {
    '+@MONGO_CONNECTION': 'string',
    '+@MONGO_DB': 'string',
    'MONGO_OPTIONS': {}
}

export interface ENV_CONFIG extends ENV_DB_CONFIG {
    NAME: string;
    HTTP_PORT: number;
    LOG_LEVEL: string;
    
    GG_KEY_FILE: string;

    JIRA_HOST: string
    JIRA_TOKEN: string
}

const ajvEnvConfig = ajv.compile({
    '+@NAME': 'string',
    '@HTTP_PORT': 'number',
    '+@GG_KEY_FILE': 'string',
    '+@JIRA_HOST': 'string',
    '+@JIRA_TOKEN': 'string',
    '@LOG_LEVEL': 'string',
    ...ajvEnvDbConfig
})

const ENV_DEFAULT: Partial<ENV_CONFIG> = {
    HTTP_PORT: 3000,
    LOG_LEVEL: 'debug'
}

const envCustomParser = {
    HTTP_PORT: hera.parseInt
}

function loadConfig(): ENV_CONFIG {
    configureDotenv({ path: path.resolve(process.cwd(), 'process.env') })
    console.debug('process.env')
    console.debug(JSON.stringify(process.env, null, 2))
    const config: any = _.cloneDeep(ENV_DEFAULT);
    for (const key in process.env) {
        let val = process.env[key]
        if (envCustomParser[key]) {
            val = envCustomParser[key](val)
        }
        _.set(config, key, val);
    }

    if (!ajvEnvConfig(config)) throw new Error(`Invalid env config; ${JSON.stringify(ajvEnvConfig.errors, null, 2)}`)
    return config as ENV_CONFIG;
}

export const ENV: ENV_CONFIG = loadConfig();
export default ENV;
