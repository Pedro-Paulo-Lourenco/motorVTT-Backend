/** Trata eventos Socket.IO específicos de atualização de fichas. */
// Importações: reúnem bibliotecas, tipos e módulos locais usados pelos blocos seguintes.
import type { Server, Socket } from 'socket.io';
import { z } from 'zod';
import { uuidSchema } from '@motor-vtt/contracts';

import { HttpError } from '../http/errors.js';
import { sheetService } from '../services/sheetService.js';

// Constante ou estado local: `updateResourceSchema` mantém o dado necessário ao fluxo abaixo.
const updateResourceSchema = z.strictObject({
    sheetId: uuidSchema,
    salaId: uuidSchema,
    fieldId: z.string().trim().min(1).max(80),
    newValue: z.union([
        z.number().finite(),
        z.record(z.string(), z.unknown()),
    ]),
});

// Tipo: `SheetSocketPayload` descreve o formato estruturado usado nas operações relacionadas.
interface SheetSocketPayload {
    sheetId: string;
    salaId: string;
    fieldId: string;
    newValue: number | Record<string, unknown>;
}

// Tipo: `SheetSocketContext` descreve o formato estruturado usado nas operações relacionadas.
interface SheetSocketContext {
    getRoomId: (socket: Socket) => string | undefined;
    confirmSession: () => Promise<boolean>;
    serializeRoom: <T>(roomId: string, operation: () => Promise<T>) => Promise<T>;
}

// Bloco local: `emitError` concentra uma responsabilidade reutilizada dentro deste módulo.
function emitError(socket: Socket, code: string, message: string): void {
    socket.emit('sheet:error', { code, message });
}

// Exportação principal: `registerSheetSocketHandler` disponibiliza esta responsabilidade para os consumidores deste módulo.
export function registerSheetSocketHandler(
    socket: Socket,
    io: Server,
    context: SheetSocketContext,
): void {
    socket.on('sheet:update-resource', (payload: unknown) => {
        void (async () => {
// Constante ou estado local: `parsed` mantém o dado necessário ao fluxo abaixo.
            const parsed = updateResourceSchema.safeParse(payload);
// Condição: altera o caminho de execução somente quando a regra indicada é verdadeira.
            if (!parsed.success) {
                emitError(socket, 'INVALID_PAYLOAD', 'Payload inválido.');
                return;
            }
// Constante ou estado local: `roomId` mantém o dado necessário ao fluxo abaixo.
            const roomId = context.getRoomId(socket);
// Condição: altera o caminho de execução somente quando a regra indicada é verdadeira.
            if (!roomId || roomId !== parsed.data.salaId) {
                emitError(socket, 'ROOM_ACCESS_DENIED', 'A atualização deve ocorrer na sala conectada.');
                return;
            }
// Condição: altera o caminho de execução somente quando a regra indicada é verdadeira.
            if (!await context.confirmSession()) {
                emitError(socket, 'AUTH_REQUIRED', 'Autenticação necessária.');
                socket.disconnect(true);
                return;
            }

            await context.serializeRoom(roomId, async () => {
// Constante ou estado local: `userId` mantém o dado necessário ao fluxo abaixo.
                const userId = socket.data.userId;
// Condição: altera o caminho de execução somente quando a regra indicada é verdadeira.
                if (typeof userId !== 'string') throw new HttpError(401, 'UNAUTHORIZED', 'Não autorizado.');
// Constante ou estado local: `result` mantém o dado necessário ao fluxo abaixo.
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
// Condição: altera o caminho de execução somente quando a regra indicada é verdadeira.
                if (result.tokenBar) {
                    io.to(`tabletop:v1:room:${roomId}`).emit('token:bar-updated', result.tokenBar);
                }
            });
        })().catch((error: unknown) => {
// Condição: altera o caminho de execução somente quando a regra indicada é verdadeira.
            if (error instanceof HttpError) {
                emitError(socket, error.code, error.message);
                return;
            }
            console.error('Falha ao sincronizar recurso da ficha via socket.', error);
            emitError(socket, 'INTERNAL_ERROR', 'Não foi possível atualizar o recurso.');
        });
    });
}
