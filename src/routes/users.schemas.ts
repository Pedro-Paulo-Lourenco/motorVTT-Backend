import { z } from 'zod';

export const userParamsSchema = z.object({ id: z.string().uuid() });

export const userQuerySchema = z.object({
    includeInactive: z.coerce.boolean().default(false),
});

export type UserParams = z.infer<typeof userParamsSchema>;
export type UserQuery = z.infer<typeof userQuerySchema>;
