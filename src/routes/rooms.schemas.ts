/** Define os schemas de entrada usados pelas operações de salas. */
// Dependências deste módulo: cada importação fornece recursos, tipos ou integrações usados na implementação abaixo.
import { z } from 'zod';
import { roomSchema, uuidSchema } from '@motor-vtt/contracts';

// API pública do módulo: `createRoomSchema` define a interface pública consumida pelos demais módulos.
export const createRoomSchema = z.strictObject({
    nome: roomSchema.shape.nome,
    templateId: uuidSchema.optional(),
});

// API pública do módulo: `joinRoomSchema` define a interface pública consumida pelos demais módulos.
export const joinRoomSchema = z.strictObject({
    codigoConvite: roomSchema.shape.codigoConvite,
});

// API pública do módulo: `roomIdParamsSchema` define a interface pública consumida pelos demais módulos.
export const roomIdParamsSchema = z.strictObject({
    salaId: uuidSchema,
});

// API pública do módulo: `CreateRoomBody` define a interface pública consumida pelos demais módulos.
export type CreateRoomBody = z.infer<typeof createRoomSchema>;
// API pública do módulo: `JoinRoomBody` define a interface pública consumida pelos demais módulos.
export type JoinRoomBody = z.infer<typeof joinRoomSchema>;
// API pública do módulo: `RoomIdParams` define a interface pública consumida pelos demais módulos.
export type RoomIdParams = z.infer<typeof roomIdParamsSchema>;
