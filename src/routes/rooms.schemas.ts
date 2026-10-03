import { z } from 'zod';
import { roomSchema, uuidSchema } from '@motor-vtt/contracts';

export const createRoomSchema = z.strictObject({
    nome: roomSchema.shape.nome,
});

export const joinRoomSchema = z.strictObject({
    codigoConvite: roomSchema.shape.codigoConvite,
});

export const roomIdParamsSchema = z.strictObject({
    salaId: uuidSchema,
});

export type CreateRoomBody = z.infer<typeof createRoomSchema>;
export type JoinRoomBody = z.infer<typeof joinRoomSchema>;
export type RoomIdParams = z.infer<typeof roomIdParamsSchema>;
