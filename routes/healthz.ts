import { ExpressRouter, GET } from "express-router-ts";
import HC from "../glob/hc";
import { DocSuccessResponse } from "../utils/decors";

class HealthCheckRouter extends ExpressRouter {
    document = {
        'tags': ['Ultilities']
    }
    
    @DocSuccessResponse()
    @GET({path: "/"})
    async checkHealth() {
        return HC.SUCCESS
    }
}

export default new HealthCheckRouter()
