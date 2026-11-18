/** Registra os eventos Socket.IO do tabletop e autoriza o acesso às salas. */
// Dependências deste módulo: cada importação fornece recursos, tipos ou integrações usados na implementação abaixo.
import type { Server as HttpServer } from 'node:http';

import { uuidSchema, type MessageLog } from '@motor-vtt/contracts';
import { Server, type Socket } from 'socket.io';
import { z } from 'zod';

import { env } from '../config/env.js';
import { HttpError } from '../http/errors.js';
import { authService, verifyAccessToken } from '../services/auth.service.js';
import {
    tabletopService,
    tokenCreateSchema,
// Contrato de dados: `TabletopState` documenta o formato e o significado dos dados trocados entre as camadas relacionadas.
    type TabletopState,
// Contrato de dados: `TabletopToken` documenta o formato e o significado dos dados trocados entre as camadas relacionadas.
    type TabletopToken,
} from '../services/tabletop.service.js';
import {
    DiceSyntaxError,
    isDiceExpressionCandidate,
    rollDiceExpression,
} from '../services/dice-roller.js';
import { registerSheetSocketHandler } from '../sockets/sheetSocketHandler.js';

// Estado intermediário: `roomJoinSchema` guarda o valor que será validado, transformado ou persistido nas etapas seguintes.
const roomJoinSchema = z.strictObject({
    v: z.literal(1),
    roomId: uuidSchema,
});
// Estado intermediário: `messageSendSchema` guarda o valor que será validado, transformado ou persistido nas etapas seguintes.
const messageSendSchema = z.strictObject({
    v: z.literal(1),
    content: z.string().trim().min(1).max(1000),
});

// Estado intermediário: `tokenAddSchema` guarda o valor que será validado, transformado ou persistido nas etapas seguintes.
const tokenAddSchema = z.strictObject({
    v: z.literal(1),
    token: tokenCreateSchema,
});
// Estado intermediário: `tokenMoveSchema` guarda o valor que será validado, transformado ou persistido nas etapas seguintes.
const tokenMoveSchema = z.strictObject({
    v: z.literal(1),
    tokenId: uuidSchema,
    x: z.number().finite(),
    y: z.number().finite(),
});
// Estado intermediário: `tokenRemoveSchema` guarda o valor que será validado, transformado ou persistido nas etapas seguintes.
const tokenRemoveSchema = z.strictObject({
    v: z.literal(1),
    tokenId: uuidSchema,
});

// Contrato de dados: `SocketErrorCode` documenta o formato e o significado dos dados trocados entre as camadas relacionadas.
type SocketErrorCode =
    | 'AUTH_REQUIRED'
    | 'INVALID_PAYLOAD'
    | 'ROOM_ACCESS_DENIED'
    | 'ROOM_NOT_JOINED'
    | 'ALREADY_JOINED'
    | 'MASTER_REQUIRED'
    | 'TOKEN_NOT_FOUND'
    | 'INVALID_DICE_EXPRESSION'
    | 'INTERNAL_ERROR';

// Contrato de dados: `SocketError` documenta o formato e o significado dos dados trocados entre as camadas relacionadas.
interface SocketError {
    v: 1;
    code: SocketErrorCode;
    message: string;
}

// Contrato de dados: `OperationAck` documenta o formato e o significado dos dados trocados entre as camadas relacionadas.
interface OperationAck {
    v: 1;
    ok: boolean;
    error?: SocketError;
    token?: TabletopToken;
    tokenId?: string;
}

// Contrato de dados: `PresencePayload` documenta o formato e o significado dos dados trocados entre as camadas relacionadas.
interface PresencePayload {
    v: 1;
    roomId: string;
    onlineUserIds: string[];
}

// Contrato de dados: `TabletopClientEvents` documenta o formato e o significado dos dados trocados entre as camadas relacionadas.
interface TabletopClientEvents {
    'tabletop:v1:join': (payload: unknown, acknowledge?: (response: OperationAck) => void) => void;
    'tabletop:v1:message:send': (payload: unknown, acknowledge?: (response: OperationAck) => void) => void;
    'tabletop:v1:token:add': (payload: unknown, acknowledge?: (response: OperationAck) => void) => void;
    'tabletop:v1:token:move': (payload: unknown, acknowledge?: (response: OperationAck) => void) => void;
    'tabletop:v1:token:remove': (payload: unknown, acknowledge?: (response: OperationAck) => void) => void;
}

// Contrato de dados: `TabletopServerEvents` documenta o formato e o significado dos dados trocados entre as camadas relacionadas.
interface TabletopServerEvents {
    'tabletop:v1:state': (state: TabletopState) => void;
    'tabletop:v1:messages': (payload: { v: 1; roomId: string; messages: MessageLog[] }) => void;
    'tabletop:v1:message:created': (payload: { v: 1; message: MessageLog }) => void;
    'tabletop:v1:presence': (presence: PresencePayload) => void;
    'tabletop:v1:token:added': (payload: { v: 1; token: TabletopToken }) => void;
    'tabletop:v1:token:moved': (payload: { v: 1; token: TabletopToken }) => void;
    'tabletop:v1:token:removed': (payload: { v: 1; tokenId: string; sceneId: string }) => void;
    'tabletop:v1:error': (error: SocketError) => void;
}

// Contrato de dados: `TabletopSocketData` documenta o formato e o significado dos dados trocados entre as camadas relacionadas.
interface TabletopSocketData {
    userId: string;
    sessionId: string;
    accessTokenExpiresAt: number;
    roomId?: string;
}

// Contrato de dados: `TabletopSocket` documenta o formato e o significado dos dados trocados entre as camadas relacionadas.
type TabletopSocket = Socket<
    TabletopClientEvents,
    TabletopServerEvents,
    Record<string, never>,
    TabletopSocketData
>;

// Função auxiliar: `socketRoom` isola uma responsabilidade reutilizada neste módulo.
function socketRoom(roomId: string): string {
    return `tabletop:v1:room:${roomId}`;
}

// Função auxiliar: `readAccessCookie` isola uma responsabilidade reutilizada neste módulo.
function readAccessCookie(cookieHeader: string | string[] | undefined): string | undefined {
// Regra de negócio: a validação abaixo decide se o fluxo pode continuar ou deve retornar antecipadamente.
    if (!cookieHeader) return undefined;
// Estado intermediário: `headers` guarda o valor que será validado, transformado ou persistido nas etapas seguintes.
    const headers = Array.isArray(cookieHeader) ? cookieHeader : [cookieHeader];
// Iteração: percorre todos os elementos para aplicar a mesma regra a cada item.
    for (const header of headers) {
// Iteração: percorre todos os elementos para aplicar a mesma regra a cada item.
        for (const item of header.split(';')) {
// Estado intermediário: `separator` guarda o valor que será validado, transformado ou persistido nas etapas seguintes.
            const separator = item.indexOf('=');
// Regra de negócio: a validação abaixo decide se o fluxo pode continuar ou deve retornar antecipadamente.
            if (separator < 0 || item.slice(0, separator).trim() !== 'access_token') continue;
// Estado intermediário: `token` guarda o valor que será validado, transformado ou persistido nas etapas seguintes.
            const token = item.slice(separator + 1).trim();
            return token.length > 0 ? token : undefined;
        }
    }
    return undefined;
}

// Função auxiliar: `sendError` isola uma responsabilidade reutilizada neste módulo.
function sendError(
    socket: TabletopSocket,
    acknowledge: ((response: OperationAck) => void) | undefined,
    code: SocketErrorCode,
    message: string,
): void {
    const error: SocketError = { v: 1, code, message };
// Regra de negócio: a validação abaixo decide se o fluxo pode continuar ou deve retornar antecipadamente.
    if (acknowledge) acknowledge({ v: 1, ok: false, error });
    else socket.emit('tabletop:v1:error', error);
}

// Função auxiliar: `mapError` isola uma responsabilidade reutilizada neste módulo.
function mapError(error: unknown): { code: SocketErrorCode; message: string } {
// Regra de negócio: a validação abaixo decide se o fluxo pode continuar ou deve retornar antecipadamente.
    if (error instanceof HttpError) {
// Regra de negócio: a validação abaixo decide se o fluxo pode continuar ou deve retornar antecipadamente.
        if (error.code === 'MASTER_REQUIRED') {
            return { code: 'MASTER_REQUIRED', message: 'Somente o mestre pode alterar tokens.' };
        }
// Regra de negócio: a validação abaixo decide se o fluxo pode continuar ou deve retornar antecipadamente.
        if (error.code === 'TOKEN_NOT_FOUND') {
            return { code: 'TOKEN_NOT_FOUND', message: 'Token não encontrado.' };
        }
// Regra de negócio: a validação abaixo decide se o fluxo pode continuar ou deve retornar antecipadamente.
        if (error.code === 'ROOM_NOT_FOUND') {
            return { code: 'ROOM_ACCESS_DENIED', message: 'Acesso à sala não autorizado.' };
        }
    }
    return { code: 'INTERNAL_ERROR', message: 'Não foi possível concluir a operação.' };
}

// API pública do módulo: `createTabletopGateway` define a interface pública consumida pelos demais módulos.
export function createTabletopGateway(httpServer: HttpServer): Server<
    TabletopClientEvents,
    TabletopServerEvents,
    Record<string, never>,
    TabletopSocketData
> {
// Estado intermediário: `io` guarda o valor que será validado, transformado ou persistido nas etapas seguintes.
    const io = new Server<
        TabletopClientEvents,
        TabletopServerEvents,
        Record<string, never>,
        TabletopSocketData
    >(httpServer, {
        cors: {
            origin: env.CORS_ORIGIN,
            credentials: true,
        },
        allowRequest: (request, callback) => {
// Estado intermediário: `origin` guarda o valor que será validado, transformado ou persistido nas etapas seguintes.
            const origin = request.headers.origin;
            callback(null, origin === undefined || origin === env.CORS_ORIGIN);
        },
    });
// Estado intermediário: `roomPresence` guarda o valor que será validado, transformado ou persistido nas etapas seguintes.
    const roomPresence = new Map<string, Map<string, Set<string>>>();
// Estado intermediário: `roomQueues` guarda o valor que será validado, transformado ou persistido nas etapas seguintes.
    const roomQueues = new Map<string, Promise<void>>();

// Função auxiliar: `serializeRoom` isola uma responsabilidade reutilizada neste módulo.
    async function serializeRoom<T>(roomId: string, operation: () => Promise<T>): Promise<T> {
// Estado intermediário: `previous` guarda o valor que será validado, transformado ou persistido nas etapas seguintes.
        const previous = roomQueues.get(roomId) ?? Promise.resolve();
// Estado intermediário: `release` guarda o valor que será validado, transformado ou persistido nas etapas seguintes.
        let release = (): void => {};
// Estado intermediário: `current` guarda o valor que será validado, transformado ou persistido nas etapas seguintes.
        const current = new Promise<void>((resolve) => {
            release = resolve;
        });
        roomQueues.set(roomId, current);
        await previous;
// Tratamento protegido: garante que o recurso seja finalizado e que erros sigam para o fluxo central de tratamento.
        try {
            return await operation();
        } finally {
            release();
// Regra de negócio: a validação abaixo decide se o fluxo pode continuar ou deve retornar antecipadamente.
            if (roomQueues.get(roomId) === current) roomQueues.delete(roomId);
        }
    }

    io.use((socket, next) => {
// Estado intermediário: `token` guarda o valor que será validado, transformado ou persistido nas etapas seguintes.
        const token = readAccessCookie(socket.handshake.headers.cookie);
// Estado intermediário: `payload` guarda o valor que será validado, transformado ou persistido nas etapas seguintes.
        const payload = token === undefined ? undefined : verifyAccessToken(token);
// Regra de negócio: a validação abaixo decide se o fluxo pode continuar ou deve retornar antecipadamente.
        if (!payload) {
            next(new Error('UNAUTHORIZED'));
            return;
        }

        void authService.authenticatedUser(payload).then((user) => {
// Regra de negócio: a validação abaixo decide se o fluxo pode continuar ou deve retornar antecipadamente.
            if (!user) {
                next(new Error('UNAUTHORIZED'));
                return;
            }
            socket.data.userId = payload.userId;
            socket.data.sessionId = payload.sessionId;
            socket.data.accessTokenExpiresAt = payload.expiresAt;
            next();
        }).catch(() => {
            console.error('Falha ao validar a sessão de uma conexão tabletop.');
            next(new Error('UNAUTHORIZED'));
        });
    });

// Função auxiliar: `onlineUserIds` isola uma responsabilidade reutilizada neste módulo.
    function onlineUserIds(roomId: string): string[] {
        return [...(roomPresence.get(roomId)?.entries() ?? [])]
            .filter(([, socketIds]) => socketIds.size > 0)
            .map(([userId]) => userId)
            .sort();
    }

// Função auxiliar: `broadcastPresence` isola uma responsabilidade reutilizada neste módulo.
    function broadcastPresence(roomId: string): void {
        io.to(socketRoom(roomId)).emit('tabletop:v1:presence', {
            v: 1,
            roomId,
            onlineUserIds: onlineUserIds(roomId),
        });
    }

// Função auxiliar: `addPresence` isola uma responsabilidade reutilizada neste módulo.
    function addPresence(roomId: string, socket: TabletopSocket): void {
// Estado intermediário: `participants` guarda o valor que será validado, transformado ou persistido nas etapas seguintes.
        let participants = roomPresence.get(roomId);
// Regra de negócio: a validação abaixo decide se o fluxo pode continuar ou deve retornar antecipadamente.
        if (!participants) {
            participants = new Map();
            roomPresence.set(roomId, participants);
        }
// Estado intermediário: `socketIds` guarda o valor que será validado, transformado ou persistido nas etapas seguintes.
        let socketIds = participants.get(socket.data.userId);
// Regra de negócio: a validação abaixo decide se o fluxo pode continuar ou deve retornar antecipadamente.
        if (!socketIds) {
            socketIds = new Set();
            participants.set(socket.data.userId, socketIds);
        }
        socketIds.add(socket.id);
    }

// Função auxiliar: `removePresence` isola uma responsabilidade reutilizada neste módulo.
    function removePresence(roomId: string, socket: TabletopSocket): void {
// Estado intermediário: `participants` guarda o valor que será validado, transformado ou persistido nas etapas seguintes.
        const participants = roomPresence.get(roomId);
// Estado intermediário: `socketIds` guarda o valor que será validado, transformado ou persistido nas etapas seguintes.
        const socketIds = participants?.get(socket.data.userId);
// Regra de negócio: a validação abaixo decide se o fluxo pode continuar ou deve retornar antecipadamente.
        if (!participants || !socketIds) return;
        socketIds.delete(socket.id);
// Regra de negócio: a validação abaixo decide se o fluxo pode continuar ou deve retornar antecipadamente.
        if (socketIds.size > 0) return;
        participants.delete(socket.data.userId);
// Regra de negócio: a validação abaixo decide se o fluxo pode continuar ou deve retornar antecipadamente.
        if (participants.size === 0) roomPresence.delete(roomId);
        broadcastPresence(roomId);
    }

// Função auxiliar: `confirmLiveSession` isola uma responsabilidade reutilizada neste módulo.
    async function confirmLiveSession(socket: TabletopSocket): Promise<boolean> {
// Regra de negócio: a validação abaixo decide se o fluxo pode continuar ou deve retornar antecipadamente.
        if (Date.now() >= socket.data.accessTokenExpiresAt) return false;
// Estado intermediário: `user` guarda o valor que será validado, transformado ou persistido nas etapas seguintes.
        const user = await authService.authenticatedUser({
            userId: socket.data.userId,
            sessionId: socket.data.sessionId,
        });
        return user !== undefined;
    }

    io.on('connection', (socket) => {
        registerSheetSocketHandler(socket, io, {
            getRoomId: (currentSocket) => currentSocket.data.roomId,
            confirmSession: () => confirmLiveSession(socket),
            serializeRoom,
        });

        socket.on('tabletop:v1:join', (payload, acknowledge) => {
            void (async () => {
// Estado intermediário: `parsed` guarda o valor que será validado, transformado ou persistido nas etapas seguintes.
                const parsed = roomJoinSchema.safeParse(payload);
// Regra de negócio: a validação abaixo decide se o fluxo pode continuar ou deve retornar antecipadamente.
                if (!parsed.success) {
                    sendError(socket, acknowledge, 'INVALID_PAYLOAD', 'Payload inválido.');
                    return;
                }
// Regra de negócio: a validação abaixo decide se o fluxo pode continuar ou deve retornar antecipadamente.
                if (!await confirmLiveSession(socket)) {
                    sendError(socket, acknowledge, 'AUTH_REQUIRED', 'Autenticação necessária.');
                    socket.disconnect(true);
                    return;
                }
// Regra de negócio: a validação abaixo decide se o fluxo pode continuar ou deve retornar antecipadamente.
                if (socket.data.roomId && socket.data.roomId !== parsed.data.roomId) {
                    sendError(socket, acknowledge, 'ALREADY_JOINED', 'Esta conexão já está associada a outra sala.');
                    return;
                }

// Tratamento protegido: garante que o recurso seja finalizado e que erros sigam para o fluxo central de tratamento.
                try {
                    await serializeRoom(parsed.data.roomId, async () => {
                        await tabletopService.getRoomMembership(parsed.data.roomId, socket.data.userId);
// Estado intermediário: `state` guarda o valor que será validado, transformado ou persistido nas etapas seguintes.
                        const state = await tabletopService.getInitialState(
                            parsed.data.roomId,
                            socket.data.userId,
                        );
// Estado intermediário: `messages` guarda o valor que será validado, transformado ou persistido nas etapas seguintes.
                        const messages = await tabletopService.getRecentMessages(
                            parsed.data.roomId,
                            socket.data.userId,
                        );
// Regra de negócio: a validação abaixo decide se o fluxo pode continuar ou deve retornar antecipadamente.
                        if (!await confirmLiveSession(socket)) {
                            sendError(socket, acknowledge, 'AUTH_REQUIRED', 'Autenticação necessária.');
                            socket.disconnect(true);
                            return;
                        }
                        await tabletopService.getRoomMembership(parsed.data.roomId, socket.data.userId);
                        await socket.join(socketRoom(parsed.data.roomId));
                        socket.data.roomId = parsed.data.roomId;
                        addPresence(parsed.data.roomId, socket);
                        socket.emit('tabletop:v1:state', state);
                        socket.emit('tabletop:v1:messages', {
                            v: 1,
                            roomId: parsed.data.roomId,
                            messages,
                        });
                        broadcastPresence(parsed.data.roomId);
                        acknowledge?.({ v: 1, ok: true });
                    });
                } catch (error) {
// Estado intermediário: `mapped` guarda o valor que será validado, transformado ou persistido nas etapas seguintes.
                    const mapped = mapError(error);
                    sendError(socket, acknowledge, mapped.code, mapped.message);
                }
            })().catch(() => {
                console.error('Falha ao processar entrada em uma sala tabletop.');
                sendError(socket, acknowledge, 'INTERNAL_ERROR', 'Não foi possível entrar na sala.');
            });
        });

        socket.on('tabletop:v1:message:send', (payload, acknowledge) => {
            void (async () => {
// Estado intermediário: `parsed` guarda o valor que será validado, transformado ou persistido nas etapas seguintes.
                const parsed = messageSendSchema.safeParse(payload);
// Regra de negócio: a validação abaixo decide se o fluxo pode continuar ou deve retornar antecipadamente.
                if (!parsed.success) {
                    sendError(socket, acknowledge, 'INVALID_PAYLOAD', 'Payload inválido.');
                    return;
                }
// Estado intermediário: `roomId` guarda o valor que será validado, transformado ou persistido nas etapas seguintes.
                const roomId = socket.data.roomId;
// Regra de negócio: a validação abaixo decide se o fluxo pode continuar ou deve retornar antecipadamente.
                if (!roomId) {
                    sendError(socket, acknowledge, 'ROOM_NOT_JOINED', 'Entre em uma sala antes de enviar mensagens.');
                    return;
                }
// Regra de negócio: a validação abaixo decide se o fluxo pode continuar ou deve retornar antecipadamente.
                if (!await confirmLiveSession(socket)) {
                    sendError(socket, acknowledge, 'AUTH_REQUIRED', 'Autenticação necessária.');
                    socket.disconnect(true);
                    return;
                }

                await serializeRoom(roomId, async () => {
// Regra de negócio: a validação abaixo decide se o fluxo pode continuar ou deve retornar antecipadamente.
                    if (!await confirmLiveSession(socket)) {
                        sendError(socket, acknowledge, 'AUTH_REQUIRED', 'Autenticação necessária.');
                        socket.disconnect(true);
                        return;
                    }
                    await tabletopService.getRoomMembership(roomId, socket.data.userId);

                    let roll: ReturnType<typeof rollDiceExpression> | undefined;
// Regra de negócio: a validação abaixo decide se o fluxo pode continuar ou deve retornar antecipadamente.
                    if (isDiceExpressionCandidate(parsed.data.content)) {
// Tratamento protegido: garante que o recurso seja finalizado e que erros sigam para o fluxo central de tratamento.
                        try {
                            roll = rollDiceExpression(parsed.data.content);
                        } catch (error) {
// Regra de negócio: a validação abaixo decide se o fluxo pode continuar ou deve retornar antecipadamente.
                            if (error instanceof DiceSyntaxError) {
                                sendError(
                                    socket,
                                    acknowledge,
                                    'INVALID_DICE_EXPRESSION',
                                    'A expressão de rolagem é inválida ou excede um limite permitido.',
                                );
                                return;
                            }
                            throw error;
                        }
                    }
// Estado intermediário: `message` guarda o valor que será validado, transformado ou persistido nas etapas seguintes.
                    const message = await tabletopService.createMessage(
                        roomId,
                        socket.data.userId,
                        parsed.data.content,
                        roll,
                    );
                    io.to(socketRoom(roomId)).emit('tabletop:v1:message:created', { v: 1, message });
                    acknowledge?.({ v: 1, ok: true });
                });
            })().catch((error: unknown) => {
// Estado intermediário: `mapped` guarda o valor que será validado, transformado ou persistido nas etapas seguintes.
                const mapped = mapError(error);
// Regra de negócio: a validação abaixo decide se o fluxo pode continuar ou deve retornar antecipadamente.
                if (mapped.code === 'INTERNAL_ERROR') {
                    console.error('Falha ao salvar mensagem tabletop.');
                }
                sendError(socket, acknowledge, mapped.code, mapped.message);
            });
        });

        socket.on('tabletop:v1:token:add', (payload, acknowledge) => {
            void (async () => {
// Estado intermediário: `parsed` guarda o valor que será validado, transformado ou persistido nas etapas seguintes.
                const parsed = tokenAddSchema.safeParse(payload);
// Regra de negócio: a validação abaixo decide se o fluxo pode continuar ou deve retornar antecipadamente.
                if (!parsed.success) {
                    sendError(socket, acknowledge, 'INVALID_PAYLOAD', 'Payload inválido.');
                    return;
                }
// Estado intermediário: `roomId` guarda o valor que será validado, transformado ou persistido nas etapas seguintes.
                const roomId = socket.data.roomId;
// Regra de negócio: a validação abaixo decide se o fluxo pode continuar ou deve retornar antecipadamente.
                if (!roomId) {
                    sendError(socket, acknowledge, 'ROOM_NOT_JOINED', 'Entre em uma sala antes de enviar operações.');
                    return;
                }
// Regra de negócio: a validação abaixo decide se o fluxo pode continuar ou deve retornar antecipadamente.
                if (!await confirmLiveSession(socket)) {
                    sendError(socket, acknowledge, 'AUTH_REQUIRED', 'Autenticação necessária.');
                    socket.disconnect(true);
                    return;
                }
                await serializeRoom(roomId, async () => {
// Estado intermediário: `token` guarda o valor que será validado, transformado ou persistido nas etapas seguintes.
                    const token = await tabletopService.addToken(roomId, socket.data.userId, parsed.data.token);
                    io.to(socketRoom(roomId)).emit('tabletop:v1:token:added', { v: 1, token });
                    acknowledge?.({ v: 1, ok: true, token });
                });
            })().catch((error: unknown) => {
// Estado intermediário: `mapped` guarda o valor que será validado, transformado ou persistido nas etapas seguintes.
                const mapped = mapError(error);
// Regra de negócio: a validação abaixo decide se o fluxo pode continuar ou deve retornar antecipadamente.
                if (mapped.code === 'INTERNAL_ERROR') {
                    console.error('Falha ao adicionar token tabletop.');
                }
                sendError(socket, acknowledge, mapped.code, mapped.message);
            });
        });

        socket.on('tabletop:v1:token:move', (payload, acknowledge) => {
            void (async () => {
// Estado intermediário: `parsed` guarda o valor que será validado, transformado ou persistido nas etapas seguintes.
                const parsed = tokenMoveSchema.safeParse(payload);
// Regra de negócio: a validação abaixo decide se o fluxo pode continuar ou deve retornar antecipadamente.
                if (!parsed.success) {
                    sendError(socket, acknowledge, 'INVALID_PAYLOAD', 'Payload inválido.');
                    return;
                }
// Estado intermediário: `roomId` guarda o valor que será validado, transformado ou persistido nas etapas seguintes.
                const roomId = socket.data.roomId;
// Regra de negócio: a validação abaixo decide se o fluxo pode continuar ou deve retornar antecipadamente.
                if (!roomId) {
                    sendError(socket, acknowledge, 'ROOM_NOT_JOINED', 'Entre em uma sala antes de enviar operações.');
                    return;
                }
// Regra de negócio: a validação abaixo decide se o fluxo pode continuar ou deve retornar antecipadamente.
                if (!await confirmLiveSession(socket)) {
                    sendError(socket, acknowledge, 'AUTH_REQUIRED', 'Autenticação necessária.');
                    socket.disconnect(true);
                    return;
                }
                await serializeRoom(roomId, async () => {
// Estado intermediário: `token` guarda o valor que será validado, transformado ou persistido nas etapas seguintes.
                    const token = await tabletopService.moveToken(
                        roomId,
                        socket.data.userId,
                        parsed.data.tokenId,
                        parsed.data.x,
                        parsed.data.y,
                    );
                    io.to(socketRoom(roomId)).emit('tabletop:v1:token:moved', { v: 1, token });
                    acknowledge?.({ v: 1, ok: true, token });
                });
            })().catch((error: unknown) => {
// Estado intermediário: `mapped` guarda o valor que será validado, transformado ou persistido nas etapas seguintes.
                const mapped = mapError(error);
// Regra de negócio: a validação abaixo decide se o fluxo pode continuar ou deve retornar antecipadamente.
                if (mapped.code === 'INTERNAL_ERROR') {
                    console.error('Falha ao mover token tabletop.');
                }
                sendError(socket, acknowledge, mapped.code, mapped.message);
            });
        });

        socket.on('tabletop:v1:token:remove', (payload, acknowledge) => {
            void (async () => {
// Estado intermediário: `parsed` guarda o valor que será validado, transformado ou persistido nas etapas seguintes.
                const parsed = tokenRemoveSchema.safeParse(payload);
// Regra de negócio: a validação abaixo decide se o fluxo pode continuar ou deve retornar antecipadamente.
                if (!parsed.success) {
                    sendError(socket, acknowledge, 'INVALID_PAYLOAD', 'Payload inválido.');
                    return;
                }
// Estado intermediário: `roomId` guarda o valor que será validado, transformado ou persistido nas etapas seguintes.
                const roomId = socket.data.roomId;
// Regra de negócio: a validação abaixo decide se o fluxo pode continuar ou deve retornar antecipadamente.
                if (!roomId) {
                    sendError(socket, acknowledge, 'ROOM_NOT_JOINED', 'Entre em uma sala antes de enviar operações.');
                    return;
                }
// Regra de negócio: a validação abaixo decide se o fluxo pode continuar ou deve retornar antecipadamente.
                if (!await confirmLiveSession(socket)) {
                    sendError(socket, acknowledge, 'AUTH_REQUIRED', 'Autenticação necessária.');
                    socket.disconnect(true);
                    return;
                }
                await serializeRoom(roomId, async () => {
// Estado intermediário: `removed` guarda o valor que será validado, transformado ou persistido nas etapas seguintes.
                    const removed = await tabletopService.removeToken(roomId, socket.data.userId, parsed.data.tokenId);
                    io.to(socketRoom(roomId)).emit('tabletop:v1:token:removed', {
                        v: 1,
                        tokenId: removed.id,
                        sceneId: removed.sceneId,
                    });
                    acknowledge?.({ v: 1, ok: true, tokenId: removed.id });
                });
            })().catch((error: unknown) => {
// Estado intermediário: `mapped` guarda o valor que será validado, transformado ou persistido nas etapas seguintes.
                const mapped = mapError(error);
// Regra de negócio: a validação abaixo decide se o fluxo pode continuar ou deve retornar antecipadamente.
                if (mapped.code === 'INTERNAL_ERROR') {
                    console.error('Falha ao remover token tabletop.');
                }
                sendError(socket, acknowledge, mapped.code, mapped.message);
            });
        });

        socket.on('disconnect', () => {
// Estado intermediário: `roomId` guarda o valor que será validado, transformado ou persistido nas etapas seguintes.
            const roomId = socket.data.roomId;
// Regra de negócio: a validação abaixo decide se o fluxo pode continuar ou deve retornar antecipadamente.
            if (!roomId) return;
            removePresence(roomId, socket);
        });
    });

    return io;
}
