import type { z } from 'zod';
import type { ValidationMiddleware, ValidatedLocals } from './types.js';
type AnySchema = z.ZodTypeAny;
type Output<T> = T extends AnySchema ? z.infer<T> : undefined;
export declare function validate<BodySchema extends AnySchema | undefined = undefined, QuerySchema extends AnySchema | undefined = undefined, ParamsSchema extends AnySchema | undefined = undefined>(schemas: {
    body?: BodySchema;
    query?: QuerySchema;
    params?: ParamsSchema;
}): ValidationMiddleware<Output<BodySchema>, Output<QuerySchema>, Output<ParamsSchema>>;
export type ValidatedRequest<Body, Query, Params> = ValidatedLocals<Body, Query, Params>;
export {};
//# sourceMappingURL=validation.d.ts.map