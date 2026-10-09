import type { Pool } from 'mysql2/promise';
import type { AuthServiceResponse, LoginInput, PublicUser, RefreshSession, RegisterInput } from '../types/auth.types.js';
export type AccessTokenPayload = {
    userId: string;
    sessionId: string;
};
export type VerifiedAccessTokenPayload = AccessTokenPayload & {
    expiresAt: number;
};
export declare function accessTokenLifetimeMilliseconds(): number;
export declare function refreshTokenLifetimeMilliseconds(): number;
export declare function verifyAccessToken(token: string): VerifiedAccessTokenPayload | undefined;
export declare class AuthService {
    private readonly database;
    constructor(database?: Pool);
    register(input: RegisterInput): Promise<{
        response: AuthServiceResponse;
        session: RefreshSession;
    }>;
    login(input: LoginInput): Promise<{
        response: AuthServiceResponse;
        session: RefreshSession;
    }>;
    refresh(refreshToken: string): Promise<{
        response: AuthServiceResponse;
        session: RefreshSession;
    }>;
    authenticatedUser(payload: AccessTokenPayload): Promise<PublicUser | undefined>;
    revokeBySessionId(sessionId: string): Promise<void>;
    revokeByRefreshToken(refreshToken: string): Promise<void>;
}
export declare const authService: AuthService;
//# sourceMappingURL=auth.service.d.ts.map