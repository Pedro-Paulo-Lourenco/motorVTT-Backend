import { randomUUID } from 'node:crypto';

import type { ErrorRequestHandler, RequestHandler } from 'express';
import { z } from 'zod';

import { sendError } from './response.js';
import { HttpError } from './errors.js';

export const correlationId: RequestHandler = (req, res, next) => {
    const incoming = req.header('x-correlation-id')?.trim();
    res.locals.correlationId = incoming || randomUUID();
    res.setHeader('x-correlation-id', res.locals.correlationId);
    next();
};

export const notFound: RequestHandler = (req, res) => {
    sendError(
        res,
        404,
        'ROUTE_NOT_FOUND',
        `Rota não encontrada: ${req.method} ${req.path}`,
    );
};

function zodDetails(error: z.ZodError): Record<string, unknown> {
    return {
        issues: error.issues.map((issue) => ({
            path: issue.path.length > 0 ? issue.path.join('.') : 'request',
            message: issue.message,
            code: issue.code,
        })),
    };
}

export const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
    if (error instanceof z.ZodError) {
        sendError(res, 422, 'VALIDATION_ERROR', 'Dados da requisição inválidos.', zodDetails(error));
        return;
    }

    if (error instanceof SyntaxError && 'body' in error) {
        sendError(res, 400, 'INVALID_JSON', 'O corpo da requisição contém JSON inválido.');
        return;
    }

    if (error instanceof HttpError) {
        sendError(res, error.statusCode, error.code, error.message, error.details);
        return;
    }

    const isProduction = process.env.NODE_ENV === 'production';
    sendError(
        res,
        500,
        'INTERNAL_SERVER_ERROR',
        isProduction ? 'Ocorreu um erro interno.' : 'Ocorreu um erro inesperado.',
        isProduction ? undefined : { error: error instanceof Error ? error.message : String(error) },
    );
};
