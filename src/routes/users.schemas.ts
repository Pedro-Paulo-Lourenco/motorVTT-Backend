/** Define os schemas de entrada das operações de usuário. */
// Dependências deste módulo: cada importação fornece recursos, tipos ou integrações usados na implementação abaixo.
import { z } from 'zod';
import { uuidSchema } from '@motor-vtt/contracts';

// API pública do módulo: `userParamsSchema` define a interface pública consumida pelos demais módulos.
export const userParamsSchema = z.object({ id: uuidSchema });

// API pública do módulo: `userQuerySchema` define a interface pública consumida pelos demais módulos.
export const userQuerySchema = z.object({
    includeInactive: z.coerce.boolean().default(false),
});

// API pública do módulo: `UserParams` define a interface pública consumida pelos demais módulos.
export type UserParams = z.infer<typeof userParamsSchema>;
// API pública do módulo: `UserQuery` define a interface pública consumida pelos demais módulos.
export type UserQuery = z.infer<typeof userQuerySchema>;
