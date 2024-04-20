import { ENV_CONFIG } from './env';

// ************ CONFIGS ************
export class AppConnections {
    constructor() {

    }

    async configureConnections(config: ENV_CONFIG) {
    }
}

const CONN = new AppConnections();
export default CONN;
