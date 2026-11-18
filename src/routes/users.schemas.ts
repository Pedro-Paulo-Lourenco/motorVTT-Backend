/** Define os schemas de entrada das operações de usuário. */
// Importações: reúnem bibliotecas, tipos e módulos locais usados pelos blocos seguintes.
import { z } from 'zod';
import { uuidSchema } from '@motor-vtt/contracts';

// Exportação principal: `userParamsSchema` disponibiliza esta responsabilidade para os consumidores deste módulo.
export const userParamsSchema = z.object({ id: uuidSchema });

// Exportação principal: `userQuerySchema` disponibiliza esta responsabilidade para os consumidores deste módulo.
export const userQuerySchema = z.object({
    includeInactive: z.coerce.boolean().default(false),
});

// Exportação principal: `UserParams` disponibiliza esta responsabilidade para os consumidores deste módulo.
export type UserParams = z.infer<typeof userParamsSchema>;
// Exportação principal: `UserQuery` disponibiliza esta responsabilidade para os consumidores deste módulo.
export type UserQuery = z.infer<typeof userQuerySchema>;
