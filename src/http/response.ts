/** Centraliza os envelopes de sucesso e erro retornados pela API. */
// Dependências deste módulo: cada importação fornece recursos, tipos ou integrações usados na implementação abaixo.
import type { Response } from 'express';

import type { ApiResponse, HttpLocals } from './types.js';

// API pública do módulo: `sendSuccess` define a interface pública consumida pelos demais módulos.
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

// Regra de negócio: a validação abaixo decide se o fluxo pode continuar ou deve retornar antecipadamente.
    if (message !== undefined) response.message = message;
// Regra de negócio: a validação abaixo decide se o fluxo pode continuar ou deve retornar antecipadamente.
    if (res.locals.correlationId !== undefined) {
        response.correlationId = res.locals.correlationId;
    }

    res.status(status).json(response);
}

// API pública do módulo: `sendError` define a interface pública consumida pelos demais módulos.
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

// Regra de negócio: a validação abaixo decide se o fluxo pode continuar ou deve retornar antecipadamente.
    if (details !== undefined) error.details = details;
// Regra de negócio: a validação abaixo decide se o fluxo pode continuar ou deve retornar antecipadamente.
    if (res.locals.correlationId !== undefined) {
        error.correlationId = res.locals.correlationId;
    }

    res.status(status).json({ success: false, error });
}
