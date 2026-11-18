/** Autentica access tokens e anexa o usuário à requisição Express. */
// Dependências deste módulo: cada importação fornece recursos, tipos ou integrações usados na implementação abaixo.
import type { RequestHandler } from 'express';

import { HttpError } from '../http/errors.js';
import { authService, verifyAccessToken } from '../services/auth.service.js';

// Função auxiliar: `readAccessToken` isola uma responsabilidade reutilizada neste módulo.
function readAccessToken(header: string | undefined, cookie: unknown): string | undefined {
// Regra de negócio: a validação abaixo decide se o fluxo pode continuar ou deve retornar antecipadamente.
    if (header !== undefined) {
// Estado intermediário: `match` guarda o valor que será validado, transformado ou persistido nas etapas seguintes.
        const match = /^Bearer\s+(.+)$/i.exec(header.trim());
        return match?.[1];
    }
    return typeof cookie === 'string' ? cookie : undefined;
}

// API pública do módulo: `authenticate` define a interface pública consumida pelos demais módulos.
export const authenticate: RequestHandler = async (req, _res, next) => {
// Estado intermediário: `token` guarda o valor que será validado, transformado ou persistido nas etapas seguintes.
    const token = readAccessToken(req.header('authorization'), req.cookies?.access_token);
// Estado intermediário: `payload` guarda o valor que será validado, transformado ou persistido nas etapas seguintes.
    const payload = token === undefined ? undefined : verifyAccessToken(token);
// Regra de negócio: a validação abaixo decide se o fluxo pode continuar ou deve retornar antecipadamente.
    if (!payload) {
        next(new HttpError(401, 'UNAUTHORIZED', 'Não autorizado.'));
        return;
    }

// Tratamento protegido: garante que o recurso seja finalizado e que erros sigam para o fluxo central de tratamento.
    try {
// Estado intermediário: `user` guarda o valor que será validado, transformado ou persistido nas etapas seguintes.
        const user = await authService.authenticatedUser(payload);
// Regra de negócio: a validação abaixo decide se o fluxo pode continuar ou deve retornar antecipadamente.
        if (!user) {
            next(new HttpError(401, 'UNAUTHORIZED', 'Não autorizado.'));
            return;
        }
        req.user = { id: payload.userId, sessionId: payload.sessionId };
        next();
    } catch (error) {
        next(error);
    }
};
