/** Adapta as operações de autenticação para o contrato HTTP público. */
// Dependências deste módulo: cada importação fornece recursos, tipos ou integrações usados na implementação abaixo.
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

// Função auxiliar: `writeSessionCookies` isola uma responsabilidade reutilizada neste módulo.
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

// Função auxiliar: `clearSessionCookies` isola uma responsabilidade reutilizada neste módulo.
function clearSessionCookies(res: Response): void {
    res.clearCookie('access_token', { ...commonCookieOptions, path: '/' });
    res.clearCookie('refresh_token', { ...commonCookieOptions, path: '/api/auth' });
}

export async function register(
    _req: Request,
    res: Response<ApiResponse<AuthResponse>, ValidatedLocals<RegisterBody, undefined, undefined>>,
): Promise<void> {
// Estado intermediário: `result` guarda o valor que será validado, transformado ou persistido nas etapas seguintes.
    const result = await authService.register(res.locals.validated.body);
    writeSessionCookies(res, result);
    sendSuccess(res, 201, authResponseSchema.parse({ user: result.response.user }));
}

export async function login(
    _req: Request,
    res: Response<ApiResponse<AuthResponse>, ValidatedLocals<LoginBody, undefined, undefined>>,
): Promise<void> {
// Estado intermediário: `result` guarda o valor que será validado, transformado ou persistido nas etapas seguintes.
    const result = await authService.login(res.locals.validated.body);
    writeSessionCookies(res, result);
    sendSuccess(res, 200, authResponseSchema.parse({ user: result.response.user }));
}

export async function refresh(req: Request, res: Response<ApiResponse<AuthResponse>>): Promise<void> {
// Estado intermediário: `refreshToken` guarda o valor que será validado, transformado ou persistido nas etapas seguintes.
    const refreshToken = req.cookies?.refresh_token;
// Regra de negócio: a validação abaixo decide se o fluxo pode continuar ou deve retornar antecipadamente.
    if (typeof refreshToken !== 'string') {
        throw new HttpError(401, 'UNAUTHORIZED', 'Não autorizado.');
    }
// Estado intermediário: `result` guarda o valor que será validado, transformado ou persistido nas etapas seguintes.
    const result = await authService.refresh(refreshToken);
    writeSessionCookies(res, result);
    sendSuccess(res, 200, authResponseSchema.parse({ user: result.response.user }));
}

export async function me(req: Request, res: Response<ApiResponse<unknown>>): Promise<void> {
// Regra de negócio: a validação abaixo decide se o fluxo pode continuar ou deve retornar antecipadamente.
    if (!req.user) throw new HttpError(401, 'UNAUTHORIZED', 'Não autorizado.');
// Estado intermediário: `user` guarda o valor que será validado, transformado ou persistido nas etapas seguintes.
    const user = await authService.authenticatedUser({ userId: req.user.id, sessionId: req.user.sessionId });
// Regra de negócio: a validação abaixo decide se o fluxo pode continuar ou deve retornar antecipadamente.
    if (!user) throw new HttpError(401, 'UNAUTHORIZED', 'Não autorizado.');
    sendSuccess(res, 200, authResponseSchema.parse({ user }));
}

export async function logout(req: Request, res: Response<ApiResponse<Record<string, never>>>): Promise<void> {
// Estado intermediário: `authorization` guarda o valor que será validado, transformado ou persistido nas etapas seguintes.
    const authorization = req.header('authorization');
// Estado intermediário: `bearer` guarda o valor que será validado, transformado ou persistido nas etapas seguintes.
    const bearer = authorization === undefined ? undefined : /^Bearer\s+(.+)$/i.exec(authorization.trim())?.[1];
// Estado intermediário: `accessToken` guarda o valor que será validado, transformado ou persistido nas etapas seguintes.
    const accessToken = bearer ?? req.cookies?.access_token;
// Estado intermediário: `payload` guarda o valor que será validado, transformado ou persistido nas etapas seguintes.
    const payload = typeof accessToken === 'string' ? verifyAccessToken(accessToken) : undefined;
// Regra de negócio: a validação abaixo decide se o fluxo pode continuar ou deve retornar antecipadamente.
    if (payload) await authService.revokeBySessionId(payload.sessionId);
// Caminho alternativo: trata o cenário em que a condição principal não foi satisfeita.
    else if (typeof req.cookies?.refresh_token === 'string') await authService.revokeByRefreshToken(req.cookies.refresh_token);
    clearSessionCookies(res);
    sendSuccess(res, 200, {});
}
