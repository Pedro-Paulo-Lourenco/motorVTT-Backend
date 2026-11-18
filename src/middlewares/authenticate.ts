/** Autentica access tokens e anexa o usuário à requisição Express. */
// Importações: reúnem bibliotecas, tipos e módulos locais usados pelos blocos seguintes.
import type { RequestHandler } from 'express';

import { HttpError } from '../http/errors.js';
import { authService, verifyAccessToken } from '../services/auth.service.js';

// Bloco local: `readAccessToken` concentra uma responsabilidade reutilizada dentro deste módulo.
function readAccessToken(header: string | undefined, cookie: unknown): string | undefined {
// Condição: altera o caminho de execução somente quando a regra indicada é verdadeira.
    if (header !== undefined) {
// Constante ou estado local: `match` mantém o dado necessário ao fluxo abaixo.
        const match = /^Bearer\s+(.+)$/i.exec(header.trim());
        return match?.[1];
    }
    return typeof cookie === 'string' ? cookie : undefined;
}

// Exportação principal: `authenticate` disponibiliza esta responsabilidade para os consumidores deste módulo.
export const authenticate: RequestHandler = async (req, _res, next) => {
// Constante ou estado local: `token` mantém o dado necessário ao fluxo abaixo.
    const token = readAccessToken(req.header('authorization'), req.cookies?.access_token);
// Constante ou estado local: `payload` mantém o dado necessário ao fluxo abaixo.
    const payload = token === undefined ? undefined : verifyAccessToken(token);
// Condição: altera o caminho de execução somente quando a regra indicada é verdadeira.
    if (!payload) {
        next(new HttpError(401, 'UNAUTHORIZED', 'Não autorizado.'));
        return;
    }

// Bloco protegido: mantém o fluxo principal e suas finalizações ou tratamentos associados.
    try {
// Constante ou estado local: `user` mantém o dado necessário ao fluxo abaixo.
        const user = await authService.authenticatedUser(payload);
// Condição: altera o caminho de execução somente quando a regra indicada é verdadeira.
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
