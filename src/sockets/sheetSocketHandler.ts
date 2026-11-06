import type { Server, Socket } from 'socket.io';
import { z } from 'zod';
import { uuidSchema } from '@motor-vtt/contracts';

import { HttpError } from '../http/errors.js';
import { sheetService } from '../services/sheetService.js';

const updateResourceSchema = z.strictObject({
    sheetId: uuidSchema,
    salaId: uuidSchema,
    fieldId: z.string().trim().min(1).max(80),
    newValue: z.union([
        z.number().finite(),
        z.record(z.string(), z.unknown()),
    ]),
});

interface SheetSocketPayload {
    sheetId: string;
    salaId: string;
    fieldId: string;
    newValue: number | Record<string, unknown>;
}

interface SheetSocketContext {
    getRoomId: (socket: Socket) => string | undefined;
    confirmSession: () => Promise<boolean>;
    serializeRoom: <T>(roomId: string, operation: () => Promise<T>) => Promise<T>;
}

function emitError(socket: Socket, code: string, message: string): void {
    socket.emit('sheet:error', { code, message });
}

export function registerSheetSocketHandler(
    socket: Socket,
    io: Server,
    context: SheetSocketContext,
): void {
    socket.on('sheet:update-resource', (payload: unknown) => {
        void (async () => {
            const parsed = updateResourceSchema.safeParse(payload);
            if (!parsed.success) {
                emitError(socket, 'INVALID_PAYLOAD', 'Payload inválido.');
                return;
            }
            const roomId = context.getRoomId(socket);
            if (!roomId || roomId !== parsed.data.salaId) {
                emitError(socket, 'ROOM_ACCESS_DENIED', 'A atualização deve ocorrer na sala conectada.');
                return;
            }
            if (!await context.confirmSession()) {
                emitError(socket, 'AUTH_REQUIRED', 'Autenticação necessária.');
                socket.disconnect(true);
                return;
            }

            await context.serializeRoom(roomId, async () => {
                const userId = socket.data.userId;
                if (typeof userId !== 'string') throw new HttpError(401, 'UNAUTHORIZED', 'Não autorizado.');
                const result = await sheetService.updateSheetResource(
                    parsed.data.sheetId,
                    roomId,
                    userId,
                    parsed.data.fieldId,
                    parsed.data.newValue,
                );
                io.to(`tabletop:v1:room:${roomId}`).emit('sheet:updated', {
                    sheetId: result.sheet.id,
                    salaId: roomId,
                    dadosPreenchidos: result.sheet.dadosPreenchidos,
                    versao: result.sheet.versao,
                });
                if (result.tokenBar) {
                    io.to(`tabletop:v1:room:${roomId}`).emit('token:bar-updated', result.tokenBar);
                }
            });
        })().catch((error: unknown) => {
            if (error instanceof HttpError) {
                emitError(socket, error.code, error.message);
                return;
            }
            console.error('Falha ao sincronizar recurso da ficha via socket.', error);
            emitError(socket, 'INTERNAL_ERROR', 'Não foi possível atualizar o recurso.');
        });
    });
}
