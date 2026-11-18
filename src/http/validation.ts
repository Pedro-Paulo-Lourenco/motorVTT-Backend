/** Constrói o middleware que valida body, query e parâmetros com Zod. */
// Importações: reúnem bibliotecas, tipos e módulos locais usados pelos blocos seguintes.
import type { RequestHandler } from 'express';
import type { z } from 'zod';

import type { ValidationMiddleware, ValidatedLocals } from './types.js';

// Tipo: `AnySchema` descreve o formato estruturado usado nas operações relacionadas.
type AnySchema = z.ZodTypeAny;
// Tipo: `Output` descreve o formato estruturado usado nas operações relacionadas.
type Output<T> = T extends AnySchema ? z.infer<T> : undefined;

// Exportação principal: `validate` disponibiliza esta responsabilidade para os consumidores deste módulo.
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
// Bloco protegido: mantém o fluxo principal e suas finalizações ou tratamentos associados.
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

// Exportação principal: `ValidatedRequest` disponibiliza esta responsabilidade para os consumidores deste módulo.
export type ValidatedRequest<Body, Query, Params> = ValidatedLocals<
    Body,
    Query,
    Params
>;
