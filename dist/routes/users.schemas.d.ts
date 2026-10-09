import { z } from 'zod';
export declare const userParamsSchema: z.ZodObject<{
    id: z.ZodString;
}, z.core.$strip>;
export declare const userQuerySchema: z.ZodObject<{
    includeInactive: z.ZodDefault<z.ZodCoercedBoolean<unknown>>;
}, z.core.$strip>;
export type UserParams = z.infer<typeof userParamsSchema>;
export type UserQuery = z.infer<typeof userQuerySchema>;
//# sourceMappingURL=users.schemas.d.ts.map