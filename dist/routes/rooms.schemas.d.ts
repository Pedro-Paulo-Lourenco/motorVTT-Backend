import { z } from 'zod';
export declare const createRoomSchema: z.ZodObject<{
    nome: z.ZodString;
}, z.core.$strict>;
export declare const joinRoomSchema: z.ZodObject<{
    codigoConvite: z.ZodString;
}, z.core.$strict>;
export declare const roomIdParamsSchema: z.ZodObject<{
    salaId: z.ZodString;
}, z.core.$strict>;
export type CreateRoomBody = z.infer<typeof createRoomSchema>;
export type JoinRoomBody = z.infer<typeof joinRoomSchema>;
export type RoomIdParams = z.infer<typeof roomIdParamsSchema>;
//# sourceMappingURL=rooms.schemas.d.ts.map