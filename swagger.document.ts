import { EROpenAPIDocument, ExpressRouter } from "express-router-ts";
import fs = require('fs-extra')
import hera from "./utils/hera";
import _ from "lodash";
import HC from "./glob/hc";

export class Program {
    public static async main(): Promise<number> {
        const doc = new EROpenAPIDocument()
        doc.components = EROpenAPIDocument.COMPONENTS
        doc.info.title = HC.APP_NAME
        doc.info.version = '1.0.0'
        doc.servers.push(<any>{url: 'http://localhost:3000'})
        doc.components.securitySchemes = {
            "AccessToken": {
                "type":"apiKey",
                "name":"Authorization",
                "in":"header",
                "description": "Access token",
            },
            "ServiceKeyHeader": {
              "type": "apiKey",
              "name": "apiKey",
              "description": "API Key",
              "in": "header"
            }
        }

        const routers = await ExpressRouter.loadRoutersInDir(`${__dirname}/routes`)
        await hera.sleep()

        routers.forEach(r => {
            // console.log(`Importing file ${r.file}`)
            doc.addRouter(r.er, undefined, r.path)
            // console.log(`Imported file ${r.file}`)
        })

        // console.log(JSON.stringify(doc))
        await fs.writeFile(`dist/${doc.info.title}.${doc.info.version}.openapi.json`, JSON.stringify(doc))
        console.log('DONE')

        return 0;
    }
}

if (require.main == module) { // this is main file
    Program.main();
}

export default Program;
