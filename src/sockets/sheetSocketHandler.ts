/** Trata eventos Socket.IO específicos de atualização de fichas. */
// Dependências deste módulo: cada importação fornece recursos, tipos ou integrações usados na implementação abaixo.
import type { Server, Socket } from 'socket.io';
import { z } from 'zod';
import { uuidSchema } from '@motor-vtt/contracts';

import { HttpError } from '../http/errors.js';
import { sheetService } from '../services/sheetService.js';

// Estado intermediário: `updateResourceSchema` guarda o valor que será validado, transformado ou persistido nas etapas seguintes.
const updateResourceSchema = z.strictObject({
    sheetId: uuidSchema,
    salaId: uuidSchema,
    fieldId: z.string().trim().min(1).max(80),
    newValue: z.union([
        z.number().finite(),
        z.record(z.string(), z.unknown()),
    ]),
});

// Contrato de dados: `SheetSocketPayload` documenta o formato e o significado dos dados trocados entre as camadas relacionadas.
interface SheetSocketPayload {
    sheetId: string;
    salaId: string;
    fieldId: string;
    newValue: number | Record<string, unknown>;
}

// Contrato de dados: `SheetSocketContext` documenta o formato e o significado dos dados trocados entre as camadas relacionadas.
interface SheetSocketContext {
    getRoomId: (socket: Socket) => string | undefined;
    confirmSession: () => Promise<boolean>;
    serializeRoom: <T>(roomId: string, operation: () => Promise<T>) => Promise<T>;
}

// Função auxiliar: `emitError` isola uma responsabilidade reutilizada neste módulo.
function emitError(socket: Socket, code: string, message: string): void {
    socket.emit('sheet:error', { code, message });
}

// API pública do módulo: `registerSheetSocketHandler` define a interface pública consumida pelos demais módulos.
export function registerSheetSocketHandler(
    socket: Socket,
    io: Server,
    context: SheetSocketContext,
): void {
    socket.on('sheet:update-resource', (payload: unknown) => {
        void (async () => {
// Estado intermediário: `parsed` guarda o valor que será validado, transformado ou persistido nas etapas seguintes.
            const parsed = updateResourceSchema.safeParse(payload);
// Regra de negócio: a validação abaixo decide se o fluxo pode continuar ou deve retornar antecipadamente.
            if (!parsed.success) {
                emitError(socket, 'INVALID_PAYLOAD', 'Payload inválido.');
                return;
            }
// Estado intermediário: `roomId` guarda o valor que será validado, transformado ou persistido nas etapas seguintes.
            const roomId = context.getRoomId(socket);
// Regra de negócio: a validação abaixo decide se o fluxo pode continuar ou deve retornar antecipadamente.
            if (!roomId || roomId !== parsed.data.salaId) {
                emitError(socket, 'ROOM_ACCESS_DENIED', 'A atualização deve ocorrer na sala conectada.');
                return;
            }
// Regra de negócio: a validação abaixo decide se o fluxo pode continuar ou deve retornar antecipadamente.
            if (!await context.confirmSession()) {
                emitError(socket, 'AUTH_REQUIRED', 'Autenticação necessária.');
                socket.disconnect(true);
                return;
            }

            await context.serializeRoom(roomId, async () => {
// Estado intermediário: `userId` guarda o valor que será validado, transformado ou persistido nas etapas seguintes.
                const userId = socket.data.userId;
// Regra de negócio: a validação abaixo decide se o fluxo pode continuar ou deve retornar antecipadamente.
                if (typeof userId !== 'string') throw new HttpError(401, 'UNAUTHORIZED', 'Não autorizado.');
// Estado intermediário: `result` guarda o valor que será validado, transformado ou persistido nas etapas seguintes.
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
// Regra de negócio: a validação abaixo decide se o fluxo pode continuar ou deve retornar antecipadamente.
                if (result.tokenBar) {
                    io.to(`tabletop:v1:room:${roomId}`).emit('token:bar-updated', result.tokenBar);
                }
            });
        })().catch((error: unknown) => {
// Regra de negócio: a validação abaixo decide se o fluxo pode continuar ou deve retornar antecipadamente.
            if (error instanceof HttpError) {
                emitError(socket, error.code, error.message);
                return;
            }
            console.error('Falha ao sincronizar recurso da ficha via socket.', error);
            emitError(socket, 'INTERNAL_ERROR', 'Não foi possível atualizar o recurso.');
        });
    });
}
