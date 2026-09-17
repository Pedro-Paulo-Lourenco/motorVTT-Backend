import type { RequestHandler } from 'express';
import type { z } from 'zod';

import type { ValidationMiddleware, ValidatedLocals } from './types.js';

type AnySchema = z.ZodTypeAny;
type Output<T> = T extends AnySchema ? z.infer<T> : undefined;

export function validate<
    BodySchema extends AnySchema | undefined = undefined,
    QuerySchema extends AnySchema | undefined = undefined,
    ParamsSchema extends AnySchema | undefined = undefined,
>(schemas: {
    body?: BodySchema;
    query?: QuerySchema;
    params?: ParamsSchema;
}): ValidationMiddleware<
    Output<BodySchema>,
    Output<QuerySchema>,
    Output<ParamsSchema>
> {
    const middleware: RequestHandler = (req, res, next) => {
        try {
            res.locals.validated = {
                body: schemas.body?.parse(req.body),
                query: schemas.query?.parse(req.query),
                params: schemas.params?.parse(req.params),
            };
            next();
        } catch (error) {
            next(error);
        }
    };

    return middleware as ValidationMiddleware<
        Output<BodySchema>,
        Output<QuerySchema>,
        Output<ParamsSchema>
    >;
}

export type ValidatedRequest<Body, Query, Params> = ValidatedLocals<
    Body,
    Query,
    Params
>;
