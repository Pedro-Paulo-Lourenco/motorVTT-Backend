import type { Response } from 'express';

import type { ApiResponse, HttpLocals } from './types.js';

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

    if (message !== undefined) response.message = message;
    if (res.locals.correlationId !== undefined) {
        response.correlationId = res.locals.correlationId;
    }

    res.status(status).json(response);
}

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

    if (details !== undefined) error.details = details;
    if (res.locals.correlationId !== undefined) {
        error.correlationId = res.locals.correlationId;
    }

    res.status(status).json({ success: false, error });
}
