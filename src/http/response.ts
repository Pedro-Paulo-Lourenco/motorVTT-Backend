/** Centraliza os envelopes de sucesso e erro retornados pela API. */
// Importações: reúnem bibliotecas, tipos e módulos locais usados pelos blocos seguintes.
import type { Response } from 'express';

import type { ApiResponse, HttpLocals } from './types.js';

// Exportação principal: `sendSuccess` disponibiliza esta responsabilidade para os consumidores deste módulo.
export function sendSuccess<T>(
    res: Response<ApiResponse<T>, HttpLocals>,
    status: number,
    data: T,
    message?: string,
): void {
    const response: {
        success: true;
        data: T;
        message?: string;
        correlationId?: string;
    } = {
        success: true,
        data,
    };

// Condição: altera o caminho de execução somente quando a regra indicada é verdadeira.
    if (message !== undefined) response.message = message;
// Condição: altera o caminho de execução somente quando a regra indicada é verdadeira.
    if (res.locals.correlationId !== undefined) {
        response.correlationId = res.locals.correlationId;
    }

    res.status(status).json(response);
}

// Exportação principal: `sendError` disponibiliza esta responsabilidade para os consumidores deste módulo.
export function sendError(
    res: Response<ApiResponse<never>, HttpLocals>,
    status: number,
    code: string,
    message: string,
    details?: Record<string, unknown>,
): void {
    const error: {
        code: string;
        message: string;
        details?: Record<string, unknown>;
        correlationId?: string;
    } = { code, message };

// Condição: altera o caminho de execução somente quando a regra indicada é verdadeira.
    if (details !== undefined) error.details = details;
// Condição: altera o caminho de execução somente quando a regra indicada é verdadeira.
    if (res.locals.correlationId !== undefined) {
        error.correlationId = res.locals.correlationId;
    }

    res.status(status).json({ success: false, error });
}
