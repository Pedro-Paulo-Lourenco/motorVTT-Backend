/** Define os schemas de entrada usados pelas operações de salas. */
// Importações: reúnem bibliotecas, tipos e módulos locais usados pelos blocos seguintes.
import { z } from 'zod';
import { roomSchema, uuidSchema } from '@motor-vtt/contracts';

// Exportação principal: `createRoomSchema` disponibiliza esta responsabilidade para os consumidores deste módulo.
export const createRoomSchema = z.strictObject({
    nome: roomSchema.shape.nome,
    templateId: uuidSchema.optional(),
});

// Exportação principal: `joinRoomSchema` disponibiliza esta responsabilidade para os consumidores deste módulo.
export const joinRoomSchema = z.strictObject({
    codigoConvite: roomSchema.shape.codigoConvite,
});

// Exportação principal: `roomIdParamsSchema` disponibiliza esta responsabilidade para os consumidores deste módulo.
export const roomIdParamsSchema = z.strictObject({
    salaId: uuidSchema,
});

// Exportação principal: `CreateRoomBody` disponibiliza esta responsabilidade para os consumidores deste módulo.
export type CreateRoomBody = z.infer<typeof createRoomSchema>;
// Exportação principal: `JoinRoomBody` disponibiliza esta responsabilidade para os consumidores deste módulo.
export type JoinRoomBody = z.infer<typeof joinRoomSchema>;
// Exportação principal: `RoomIdParams` disponibiliza esta responsabilidade para os consumidores deste módulo.
export type RoomIdParams = z.infer<typeof roomIdParamsSchema>;
