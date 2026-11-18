/** Reúne tipos Express usados para autenticação e dados validados. */
// Dependências deste módulo: cada importação fornece recursos, tipos ou integrações usados na implementação abaixo.
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { ApiErrorResponse as ContractApiErrorResponse, ApiSuccess } from '@motor-vtt/contracts';
import type { z } from 'zod';

// API pública do módulo: `ApiSuccessResponse` define a interface pública consumida pelos demais módulos.
export type ApiSuccessResponse<T> = ApiSuccess<T>;

// API pública do módulo: `ApiErrorResponse` define a interface pública consumida pelos demais módulos.
export type ApiErrorResponse = ContractApiErrorResponse;

// API pública do módulo: `ApiResponse` define a interface pública consumida pelos demais módulos.
export type ApiResponse<T> = ApiSuccessResponse<T> | ApiErrorResponse;

// API pública do módulo: `HttpLocals` define a interface pública consumida pelos demais módulos.
export type HttpLocals = {
    correlationId?: string;
};

// API pública do módulo: `ValidatedLocals` define a interface pública consumida pelos demais módulos.
export type ValidatedLocals<Body, Query, Params> = HttpLocals & {
    validated: {
        body: Body;
        query: Query;
        params: Params;
    };
};

// API pública do módulo: `TypedHandler` define a interface pública consumida pelos demais módulos.
export type TypedHandler<Body = undefined, Query = undefined, Params = undefined> = (
    req: Request,
    res: Response<ApiResponse<unknown>, ValidatedLocals<Body, Query, Params>>,
    next: NextFunction,
) => void | Promise<void>;

// API pública do módulo: `SchemaOrUndefined` define a interface pública consumida pelos demais módulos.
export type SchemaOrUndefined<T> = z.ZodType<T> | undefined;

// API pública do módulo: `ValidationSchemas` define a interface pública consumida pelos demais módulos.
export type ValidationSchemas<Body = undefined, Query = undefined, Params = undefined> = {
    body?: SchemaOrUndefined<Body>;
    query?: SchemaOrUndefined<Query>;
    params?: SchemaOrUndefined<Params>;
};

// API pública do módulo: `ValidationMiddleware` define a interface pública consumida pelos demais módulos.
export type ValidationMiddleware<Body, Query, Params> = RequestHandler<
    any,
    ApiResponse<unknown>,
    any,
    any,
    ValidatedLocals<Body, Query, Params>
>;
