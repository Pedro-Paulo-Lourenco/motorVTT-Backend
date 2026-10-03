import { z } from 'zod';
import { uuidSchema } from '@motor-vtt/contracts';

export const userParamsSchema = z.object({ id: uuidSchema });

export const userQuerySchema = z.object({
    includeInactive: z.coerce.boolean().default(false),
});

export type UserParams = z.infer<typeof userParamsSchema>;
export type UserQuery = z.infer<typeof userQuerySchema>;
