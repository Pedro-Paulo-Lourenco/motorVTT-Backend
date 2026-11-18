/** Contém middlewares transversais de rastreabilidade, 404 e erros. */
// Dependências deste módulo: cada importação fornece recursos, tipos ou integrações usados na implementação abaixo.
import { randomUUID } from 'node:crypto';

import type { ErrorRequestHandler, RequestHandler } from 'express';
import { z } from 'zod';

import { sendError } from './response.js';
import { HttpError } from './errors.js';

// API pública do módulo: `correlationId` define a interface pública consumida pelos demais módulos.
export const correlationId: RequestHandler = (req, res, next) => {
// Estado intermediário: `incoming` guarda o valor que será validado, transformado ou persistido nas etapas seguintes.
    const incoming = req.header('x-correlation-id')?.trim();
    res.locals.correlationId = incoming || randomUUID();
    res.setHeader('x-correlation-id', res.locals.correlationId);
    next();
};

// API pública do módulo: `notFound` define a interface pública consumida pelos demais módulos.
export const notFound: RequestHandler = (req, res) => {
    sendError(
        res,
        404,
        'ROUTE_NOT_FOUND',
        `Rota não encontrada: ${req.method} ${req.path}`,
    );
};

// Função auxiliar: `zodDetails` isola uma responsabilidade reutilizada neste módulo.
function zodDetails(error: z.ZodError): Record<string, unknown> {
    return {
        issues: error.issues.map((issue) => ({
            path: issue.path.length > 0 ? issue.path.join('.') : 'request',
            message: issue.message,
            code: issue.code,
        })),
    };
}

// API pública do módulo: `errorHandler` define a interface pública consumida pelos demais módulos.
export const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
// Regra de negócio: a validação abaixo decide se o fluxo pode continuar ou deve retornar antecipadamente.
    if (error instanceof z.ZodError) {
        sendError(res, 422, 'VALIDATION_ERROR', 'Dados da requisição inválidos.', zodDetails(error));
        return;
    }

// Regra de negócio: a validação abaixo decide se o fluxo pode continuar ou deve retornar antecipadamente.
    if (error instanceof SyntaxError && 'body' in error) {
        sendError(res, 400, 'INVALID_JSON', 'O corpo da requisição contém JSON inválido.');
        return;
    }

// Regra de negócio: a validação abaixo decide se o fluxo pode continuar ou deve retornar antecipadamente.
    if (error instanceof HttpError) {
        sendError(res, error.statusCode, error.code, error.message, error.details);
        return;
    }

// Estado intermediário: `isProduction` guarda o valor que será validado, transformado ou persistido nas etapas seguintes.
    const isProduction = process.env.NODE_ENV === 'production';
    sendError(
        res,
        500,
        'INTERNAL_SERVER_ERROR',
        isProduction ? 'Ocorreu um erro interno.' : 'Ocorreu um erro inesperado.',
        isProduction ? undefined : { error: error instanceof Error ? error.message : String(error) },
    );
};
