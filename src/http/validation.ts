/** Constrói o middleware que valida body, query e parâmetros com Zod. */
// Dependências deste módulo: cada importação fornece recursos, tipos ou integrações usados na implementação abaixo.
import type { RequestHandler } from 'express';
import type { z } from 'zod';

import type { ValidationMiddleware, ValidatedLocals } from './types.js';

// Contrato de dados: `AnySchema` documenta o formato e o significado dos dados trocados entre as camadas relacionadas.
type AnySchema = z.ZodTypeAny;
// Contrato de dados: `Output` documenta o formato e o significado dos dados trocados entre as camadas relacionadas.
type Output<T> = T extends AnySchema ? z.infer<T> : undefined;

// API pública do módulo: `validate` define a interface pública consumida pelos demais módulos.
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
// Tratamento protegido: garante que o recurso seja finalizado e que erros sigam para o fluxo central de tratamento.
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

// API pública do módulo: `ValidatedRequest` define a interface pública consumida pelos demais módulos.
export type ValidatedRequest<Body, Query, Params> = ValidatedLocals<
    Body,
    Query,
    Params
>;
