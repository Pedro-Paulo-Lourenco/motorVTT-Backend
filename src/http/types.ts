import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { z } from 'zod';

export type ApiSuccessResponse<T> = {
    success: true;
    data: T;
    message?: string;
    correlationId?: string;
};

export type ApiErrorResponse = {
    success: false;
    error: {
        code: string;
        message: string;
        details?: Record<string, unknown>;
        correlationId?: string;
    };
};

export type ApiResponse<T> = ApiSuccessResponse<T> | ApiErrorResponse;

export type HttpLocals = {
    correlationId?: string;
};

export type ValidatedLocals<Body, Query, Params> = HttpLocals & {
    validated: {
        body: Body;
        query: Query;
        params: Params;
    };
};

export type TypedHandler<Body = undefined, Query = undefined, Params = undefined> = (
    req: Request,
    res: Response<ApiResponse<unknown>, ValidatedLocals<Body, Query, Params>>,
    next: NextFunction,
) => void | Promise<void>;

export type SchemaOrUndefined<T> = z.ZodType<T> | undefined;

export type ValidationSchemas<Body = undefined, Query = undefined, Params = undefined> = {
    body?: SchemaOrUndefined<Body>;
    query?: SchemaOrUndefined<Query>;
    params?: SchemaOrUndefined<Params>;
};

export type ValidationMiddleware<Body, Query, Params> = RequestHandler<
    any,
    ApiResponse<unknown>,
    any,
    any,
    ValidatedLocals<Body, Query, Params>
>;
