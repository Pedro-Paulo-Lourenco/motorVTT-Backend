import type { CookieOptions, Request, Response } from 'express';
import { authResponseSchema, type AuthResponse } from '@motor-vtt/contracts';

import { env } from '../config/env.js';
import { HttpError } from '../http/errors.js';
import { sendSuccess } from '../http/response.js';
import type { ApiResponse, ValidatedLocals } from '../http/types.js';
import {
    accessTokenLifetimeMilliseconds,
    authService,
    refreshTokenLifetimeMilliseconds,
    verifyAccessToken,
} from '../services/auth.service.js';
import type { AuthServiceResponse } from '../types/auth.types.js';
import type { LoginBody, RegisterBody } from '../routes/auth.schemas.js';

const commonCookieOptions: CookieOptions = {
    httpOnly: true,
    sameSite: 'strict',
    secure: env.NODE_ENV === 'production',
};

function writeSessionCookies(res: Response, result: { response: AuthServiceResponse; session: { refreshToken: string } }): void {
    res.cookie('access_token', result.response.accessToken, {
        ...commonCookieOptions,
        path: '/',
        maxAge: accessTokenLifetimeMilliseconds(),
    });
    res.cookie('refresh_token', result.session.refreshToken, {
        ...commonCookieOptions,
        path: '/api/auth',
        maxAge: refreshTokenLifetimeMilliseconds(),
    });
}

function clearSessionCookies(res: Response): void {
    res.clearCookie('access_token', { ...commonCookieOptions, path: '/' });
    res.clearCookie('refresh_token', { ...commonCookieOptions, path: '/api/auth' });
}

export async function register(
    _req: Request,
    res: Response<ApiResponse<AuthResponse>, ValidatedLocals<RegisterBody, undefined, undefined>>,
): Promise<void> {
    const result = await authService.register(res.locals.validated.body);
    writeSessionCookies(res, result);
    sendSuccess(res, 201, authResponseSchema.parse({ user: result.response.user }));
}

export async function login(
    _req: Request,
    res: Response<ApiResponse<AuthResponse>, ValidatedLocals<LoginBody, undefined, undefined>>,
): Promise<void> {
    const result = await authService.login(res.locals.validated.body);
    writeSessionCookies(res, result);
    sendSuccess(res, 200, authResponseSchema.parse({ user: result.response.user }));
}

export async function refresh(req: Request, res: Response<ApiResponse<AuthResponse>>): Promise<void> {
    const refreshToken = req.cookies?.refresh_token;
    if (typeof refreshToken !== 'string') {
        throw new HttpError(401, 'UNAUTHORIZED', 'Não autorizado.');
    }
    const result = await authService.refresh(refreshToken);
    writeSessionCookies(res, result);
    sendSuccess(res, 200, authResponseSchema.parse({ user: result.response.user }));
}

export async function me(req: Request, res: Response<ApiResponse<unknown>>): Promise<void> {
    if (!req.user) throw new HttpError(401, 'UNAUTHORIZED', 'Não autorizado.');
    const user = await authService.authenticatedUser({ userId: req.user.id, sessionId: req.user.sessionId });
    if (!user) throw new HttpError(401, 'UNAUTHORIZED', 'Não autorizado.');
    sendSuccess(res, 200, authResponseSchema.parse({ user }));
}

export async function logout(req: Request, res: Response<ApiResponse<Record<string, never>>>): Promise<void> {
    const authorization = req.header('authorization');
    const bearer = authorization === undefined ? undefined : /^Bearer\s+(.+)$/i.exec(authorization.trim())?.[1];
    const accessToken = bearer ?? req.cookies?.access_token;
    const payload = typeof accessToken === 'string' ? verifyAccessToken(accessToken) : undefined;
    if (payload) await authService.revokeBySessionId(payload.sessionId);
    else if (typeof req.cookies?.refresh_token === 'string') await authService.revokeByRefreshToken(req.cookies.refresh_token);
    clearSessionCookies(res);
    sendSuccess(res, 200, {});
}
