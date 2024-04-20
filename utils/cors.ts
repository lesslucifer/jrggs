import * as express from 'express';

export const CORS_DEFAULT = {
    ORIGIN: '*',
    METHODS: 'OPTIONS, POST, GET, PUT, DELETE',
    AGE: '86400',
    HEADERS: 'X-Requested-With, X-HTTP-Method-Override,Content-Type, Accept, Authentication, Authorization, X-Consumer-Username'
}


export default function cors(origin?, methods?, age?, headers?): express.RequestHandler {
    return (req, resp, next) => {
        resp.header('Access-Control-Allow-Origin', origin || CORS_DEFAULT.ORIGIN);
        resp.header('Access-Control-Allow-Methods', methods || CORS_DEFAULT.METHODS);
        resp.header('Access-Control-Allow-Credentials', 'true');
        resp.header('Access-Control-Max-Age', age || CORS_DEFAULT.AGE);
        resp.header('Access-Control-Allow-Headers', headers || CORS_DEFAULT.HEADERS);

        if (req.method.toUpperCase() == 'OPTIONS') {
            resp.statusCode = 204;
            resp.send();
            return;
        }

        next();
    }
}