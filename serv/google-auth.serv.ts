import { OAuth2Client } from "google-auth-library";
import ENV from "../glob/env";

export class GoogleAuthService {
    private client: OAuth2Client;

    constructor() {
        this.client = new OAuth2Client(
            ENV.GOOGLE_CLIENT_ID,
            ENV.GOOGLE_CLIENT_SECRET,
            'postmessage'
        );
    }

    async verifyGoogleCode(code: string) {
        const { tokens } = await this.client.getToken(code);
        const ticket = await this.client.verifyIdToken({
            idToken: tokens.id_token,
            audience: ENV.GOOGLE_CLIENT_ID
        });
        const payload = ticket.getPayload();
        return {
            email: payload.email,
            name: payload.name
        };
    }
}