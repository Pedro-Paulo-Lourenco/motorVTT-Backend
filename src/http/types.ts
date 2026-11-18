/** Reúne tipos Express usados para autenticação e dados validados. */
// Importações: reúnem bibliotecas, tipos e módulos locais usados pelos blocos seguintes.
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { ApiErrorResponse as ContractApiErrorResponse, ApiSuccess } from '@motor-vtt/contracts';
import type { z } from 'zod';

// Exportação principal: `ApiSuccessResponse` disponibiliza esta responsabilidade para os consumidores deste módulo.
export type ApiSuccessResponse<T> = ApiSuccess<T>;

// Exportação principal: `ApiErrorResponse` disponibiliza esta responsabilidade para os consumidores deste módulo.
export type ApiErrorResponse = ContractApiErrorResponse;

// Exportação principal: `ApiResponse` disponibiliza esta responsabilidade para os consumidores deste módulo.
export type ApiResponse<T> = ApiSuccessResponse<T> | ApiErrorResponse;

// Exportação principal: `HttpLocals` disponibiliza esta responsabilidade para os consumidores deste módulo.
export type HttpLocals = {
    correlationId?: string;
};

// Exportação principal: `ValidatedLocals` disponibiliza esta responsabilidade para os consumidores deste módulo.
export type ValidatedLocals<Body, Query, Params> = HttpLocals & {
    validated: {
        body: Body;
        query: Query;
        params: Params;
    };
};

// Exportação principal: `TypedHandler` disponibiliza esta responsabilidade para os consumidores deste módulo.
export type TypedHandler<Body = undefined, Query = undefined, Params = undefined> = (
    req: Request,
    res: Response<ApiResponse<unknown>, ValidatedLocals<Body, Query, Params>>,
    next: NextFunction,
) => void | Promise<void>;

// Exportação principal: `SchemaOrUndefined` disponibiliza esta responsabilidade para os consumidores deste módulo.
export type SchemaOrUndefined<T> = z.ZodType<T> | undefined;

// Exportação principal: `ValidationSchemas` disponibiliza esta responsabilidade para os consumidores deste módulo.
export type ValidationSchemas<Body = undefined, Query = undefined, Params = undefined> = {
    body?: SchemaOrUndefined<Body>;
    query?: SchemaOrUndefined<Query>;
    params?: SchemaOrUndefined<Params>;
};

// Exportação principal: `ValidationMiddleware` disponibiliza esta responsabilidade para os consumidores deste módulo.
export type ValidationMiddleware<Body, Query, Params> = RequestHandler<
    any,
    ApiResponse<unknown>,
    any,
    any,
    ValidatedLocals<Body, Query, Params>
>;
