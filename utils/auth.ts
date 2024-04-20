import * as jwt from "jsonwebtoken";

export interface IAuth {
    access_token: string;
    expires_in: number;
    refresh_token: string;
    token_type: string;
    scope: string;
}

export interface IAuthUser {
    id: number | string;
    scope: string;
    fullName?: string;
    email?: string;
}

export interface IAuthenticator {
    readonly accessTokenExpires: number;
    readonly refreshTokenExpires: number;
    genTokens(user: IAuthUser): Promise<IAuth>;
    genRefreshToken(user: IAuthUser): Promise<string>;
    genAccessToken(refreshToken: string): Promise<string>;
    renewToken(accessToken: string): Promise<void>;
    revokeToken(token: string): Promise<void>;
    getUser(accessToken: string): Promise<IAuthUser>;
}

export class JWTAuth implements IAuthenticator {
    readonly secrect: string;
    readonly accessTokenExpires: number;
    readonly refreshTokenExpires: number;

    constructor(
        secrect: string,
        accessTokenExpires: number,
        refreshTokenExpires: number
    ) {
        this.secrect = secrect;
        this.accessTokenExpires = accessTokenExpires;
        this.refreshTokenExpires = refreshTokenExpires;
    }

    async genTokens(user: IAuthUser) {
        const refreshToken = await this.genRefreshToken(user);
        const now = new Date();
        const accessToken = await this.genAccessToken(refreshToken);
        const accessTokenExpiresIn = now.valueOf() / 1000 + this.accessTokenExpires;
        return <IAuth>{
            access_token: accessToken,
            expires_in: accessTokenExpiresIn,
            refresh_token: refreshToken,
            token_type: "bearer",
            scope: user.scope,
        };
    }

    async genRefreshToken(user: IAuthUser) {
        const refreshToken = jwt.sign(
            <any>{
                id: user.id,
                scope: user.scope,
                type: "REFRESH",
            },
            this.secrect,
            { expiresIn: this.refreshTokenExpires }
        );
        return refreshToken;
    }

    async genAccessToken(refreshToken: string) {
        const tokenData: any = jwt.verify(refreshToken, this.secrect);
        if (tokenData.type == "REFRESH") {
            return jwt.sign(
                <any>{
                    id: tokenData.id,
                    scope: tokenData.scope,
                    type: "ACCESS",
                },
                this.secrect,
                { expiresIn: this.accessTokenExpires }
            );
        }

        return null;
    }

    async renewToken(accessToken: string): Promise<void> {
        // cannot renew jwt token
    }

    async revokeToken(token: string): Promise<void> {
        // cannot revoke jwt token
    }

    async getUser(accessToken: string): Promise<IAuthUser> {
        throw new Error(`Invalid access token`);
    }
}
