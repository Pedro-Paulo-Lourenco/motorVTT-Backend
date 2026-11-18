/** Registra os eventos Socket.IO do tabletop e autoriza o acesso às salas. */
// Importações: reúnem bibliotecas, tipos e módulos locais usados pelos blocos seguintes.
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
// Tipo: `TabletopState` descreve o formato estruturado usado nas operações relacionadas.
    type TabletopState,
// Tipo: `TabletopToken` descreve o formato estruturado usado nas operações relacionadas.
    type TabletopToken,
} from '../services/tabletop.service.js';
import {
    DiceSyntaxError,
    isDiceExpressionCandidate,
    rollDiceExpression,
} from '../services/dice-roller.js';
import { registerSheetSocketHandler } from '../sockets/sheetSocketHandler.js';

// Constante ou estado local: `roomJoinSchema` mantém o dado necessário ao fluxo abaixo.
const roomJoinSchema = z.strictObject({
    v: z.literal(1),
    roomId: uuidSchema,
});
// Constante ou estado local: `messageSendSchema` mantém o dado necessário ao fluxo abaixo.
const messageSendSchema = z.strictObject({
    v: z.literal(1),
    content: z.string().trim().min(1).max(1000),
});

// Constante ou estado local: `tokenAddSchema` mantém o dado necessário ao fluxo abaixo.
const tokenAddSchema = z.strictObject({
    v: z.literal(1),
    token: tokenCreateSchema,
});
// Constante ou estado local: `tokenMoveSchema` mantém o dado necessário ao fluxo abaixo.
const tokenMoveSchema = z.strictObject({
    v: z.literal(1),
    tokenId: uuidSchema,
    x: z.number().finite(),
    y: z.number().finite(),
});
// Constante ou estado local: `tokenRemoveSchema` mantém o dado necessário ao fluxo abaixo.
const tokenRemoveSchema = z.strictObject({
    v: z.literal(1),
    tokenId: uuidSchema,
});

// Tipo: `SocketErrorCode` descreve o formato estruturado usado nas operações relacionadas.
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

// Tipo: `SocketError` descreve o formato estruturado usado nas operações relacionadas.
interface SocketError {
    v: 1;
    code: SocketErrorCode;
    message: string;
}

// Tipo: `OperationAck` descreve o formato estruturado usado nas operações relacionadas.
interface OperationAck {
    v: 1;
    ok: boolean;
    error?: SocketError;
    token?: TabletopToken;
    tokenId?: string;
}

// Tipo: `PresencePayload` descreve o formato estruturado usado nas operações relacionadas.
interface PresencePayload {
    v: 1;
    roomId: string;
    onlineUserIds: string[];
}

// Tipo: `TabletopClientEvents` descreve o formato estruturado usado nas operações relacionadas.
interface TabletopClientEvents {
    'tabletop:v1:join': (payload: unknown, acknowledge?: (response: OperationAck) => void) => void;
    'tabletop:v1:message:send': (payload: unknown, acknowledge?: (response: OperationAck) => void) => void;
    'tabletop:v1:token:add': (payload: unknown, acknowledge?: (response: OperationAck) => void) => void;
    'tabletop:v1:token:move': (payload: unknown, acknowledge?: (response: OperationAck) => void) => void;
    'tabletop:v1:token:remove': (payload: unknown, acknowledge?: (response: OperationAck) => void) => void;
}

// Tipo: `TabletopServerEvents` descreve o formato estruturado usado nas operações relacionadas.
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

// Tipo: `TabletopSocketData` descreve o formato estruturado usado nas operações relacionadas.
interface TabletopSocketData {
    userId: string;
    sessionId: string;
    accessTokenExpiresAt: number;
    roomId?: string;
}

// Tipo: `TabletopSocket` descreve o formato estruturado usado nas operações relacionadas.
type TabletopSocket = Socket<
    TabletopClientEvents,
    TabletopServerEvents,
    Record<string, never>,
    TabletopSocketData
>;

// Bloco local: `socketRoom` concentra uma responsabilidade reutilizada dentro deste módulo.
function socketRoom(roomId: string): string {
    return `tabletop:v1:room:${roomId}`;
}

// Bloco local: `readAccessCookie` concentra uma responsabilidade reutilizada dentro deste módulo.
function readAccessCookie(cookieHeader: string | string[] | undefined): string | undefined {
// Condição: altera o caminho de execução somente quando a regra indicada é verdadeira.
    if (!cookieHeader) return undefined;
// Constante ou estado local: `headers` mantém o dado necessário ao fluxo abaixo.
    const headers = Array.isArray(cookieHeader) ? cookieHeader : [cookieHeader];
// Iteração: processa repetidamente os elementos ou tentativas deste bloco.
    for (const header of headers) {
// Iteração: processa repetidamente os elementos ou tentativas deste bloco.
        for (const item of header.split(';')) {
// Constante ou estado local: `separator` mantém o dado necessário ao fluxo abaixo.
            const separator = item.indexOf('=');
// Condição: altera o caminho de execução somente quando a regra indicada é verdadeira.
            if (separator < 0 || item.slice(0, separator).trim() !== 'access_token') continue;
// Constante ou estado local: `token` mantém o dado necessário ao fluxo abaixo.
            const token = item.slice(separator + 1).trim();
            return token.length > 0 ? token : undefined;
        }
    }
    return undefined;
}

// Bloco local: `sendError` concentra uma responsabilidade reutilizada dentro deste módulo.
function sendError(
    socket: TabletopSocket,
    acknowledge: ((response: OperationAck) => void) | undefined,
    code: SocketErrorCode,
    message: string,
): void {
    const error: SocketError = { v: 1, code, message };
// Condição: altera o caminho de execução somente quando a regra indicada é verdadeira.
    if (acknowledge) acknowledge({ v: 1, ok: false, error });
    else socket.emit('tabletop:v1:error', error);
}

// Bloco local: `mapError` concentra uma responsabilidade reutilizada dentro deste módulo.
function mapError(error: unknown): { code: SocketErrorCode; message: string } {
// Condição: altera o caminho de execução somente quando a regra indicada é verdadeira.
    if (error instanceof HttpError) {
// Condição: altera o caminho de execução somente quando a regra indicada é verdadeira.
        if (error.code === 'MASTER_REQUIRED') {
            return { code: 'MASTER_REQUIRED', message: 'Somente o mestre pode alterar tokens.' };
        }
// Condição: altera o caminho de execução somente quando a regra indicada é verdadeira.
        if (error.code === 'TOKEN_NOT_FOUND') {
            return { code: 'TOKEN_NOT_FOUND', message: 'Token não encontrado.' };
        }
// Condição: altera o caminho de execução somente quando a regra indicada é verdadeira.
        if (error.code === 'ROOM_NOT_FOUND') {
            return { code: 'ROOM_ACCESS_DENIED', message: 'Acesso à sala não autorizado.' };
        }
    }
    return { code: 'INTERNAL_ERROR', message: 'Não foi possível concluir a operação.' };
}

// Exportação principal: `createTabletopGateway` disponibiliza esta responsabilidade para os consumidores deste módulo.
export function createTabletopGateway(httpServer: HttpServer): Server<
    TabletopClientEvents,
    TabletopServerEvents,
    Record<string, never>,
    TabletopSocketData
> {
// Constante ou estado local: `io` mantém o dado necessário ao fluxo abaixo.
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
// Constante ou estado local: `origin` mantém o dado necessário ao fluxo abaixo.
            const origin = request.headers.origin;
            callback(null, origin === undefined || origin === env.CORS_ORIGIN);
        },
    });
// Constante ou estado local: `roomPresence` mantém o dado necessário ao fluxo abaixo.
    const roomPresence = new Map<string, Map<string, Set<string>>>();
// Constante ou estado local: `roomQueues` mantém o dado necessário ao fluxo abaixo.
    const roomQueues = new Map<string, Promise<void>>();

// Bloco local: `serializeRoom` concentra uma responsabilidade reutilizada dentro deste módulo.
    async function serializeRoom<T>(roomId: string, operation: () => Promise<T>): Promise<T> {
// Constante ou estado local: `previous` mantém o dado necessário ao fluxo abaixo.
        const previous = roomQueues.get(roomId) ?? Promise.resolve();
// Constante ou estado local: `release` mantém o dado necessário ao fluxo abaixo.
        let release = (): void => {};
// Constante ou estado local: `current` mantém o dado necessário ao fluxo abaixo.
        const current = new Promise<void>((resolve) => {
            release = resolve;
        });
        roomQueues.set(roomId, current);
        await previous;
// Bloco protegido: mantém o fluxo principal e suas finalizações ou tratamentos associados.
        try {
            return await operation();
        } finally {
            release();
// Condição: altera o caminho de execução somente quando a regra indicada é verdadeira.
            if (roomQueues.get(roomId) === current) roomQueues.delete(roomId);
        }
    }

    io.use((socket, next) => {
// Constante ou estado local: `token` mantém o dado necessário ao fluxo abaixo.
        const token = readAccessCookie(socket.handshake.headers.cookie);
// Constante ou estado local: `payload` mantém o dado necessário ao fluxo abaixo.
        const payload = token === undefined ? undefined : verifyAccessToken(token);
// Condição: altera o caminho de execução somente quando a regra indicada é verdadeira.
        if (!payload) {
            next(new Error('UNAUTHORIZED'));
            return;
        }

        void authService.authenticatedUser(payload).then((user) => {
// Condição: altera o caminho de execução somente quando a regra indicada é verdadeira.
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

// Bloco local: `onlineUserIds` concentra uma responsabilidade reutilizada dentro deste módulo.
    function onlineUserIds(roomId: string): string[] {
        return [...(roomPresence.get(roomId)?.entries() ?? [])]
            .filter(([, socketIds]) => socketIds.size > 0)
            .map(([userId]) => userId)
            .sort();
    }

// Bloco local: `broadcastPresence` concentra uma responsabilidade reutilizada dentro deste módulo.
    function broadcastPresence(roomId: string): void {
        io.to(socketRoom(roomId)).emit('tabletop:v1:presence', {
            v: 1,
            roomId,
            onlineUserIds: onlineUserIds(roomId),
        });
    }

// Bloco local: `addPresence` concentra uma responsabilidade reutilizada dentro deste módulo.
    function addPresence(roomId: string, socket: TabletopSocket): void {
// Constante ou estado local: `participants` mantém o dado necessário ao fluxo abaixo.
        let participants = roomPresence.get(roomId);
// Condição: altera o caminho de execução somente quando a regra indicada é verdadeira.
        if (!participants) {
            participants = new Map();
            roomPresence.set(roomId, participants);
        }
// Constante ou estado local: `socketIds` mantém o dado necessário ao fluxo abaixo.
        let socketIds = participants.get(socket.data.userId);
// Condição: altera o caminho de execução somente quando a regra indicada é verdadeira.
        if (!socketIds) {
            socketIds = new Set();
            participants.set(socket.data.userId, socketIds);
        }
        socketIds.add(socket.id);
    }

// Bloco local: `removePresence` concentra uma responsabilidade reutilizada dentro deste módulo.
    function removePresence(roomId: string, socket: TabletopSocket): void {
// Constante ou estado local: `participants` mantém o dado necessário ao fluxo abaixo.
        const participants = roomPresence.get(roomId);
// Constante ou estado local: `socketIds` mantém o dado necessário ao fluxo abaixo.
        const socketIds = participants?.get(socket.data.userId);
// Condição: altera o caminho de execução somente quando a regra indicada é verdadeira.
        if (!participants || !socketIds) return;
        socketIds.delete(socket.id);
// Condição: altera o caminho de execução somente quando a regra indicada é verdadeira.
        if (socketIds.size > 0) return;
        participants.delete(socket.data.userId);
// Condição: altera o caminho de execução somente quando a regra indicada é verdadeira.
        if (participants.size === 0) roomPresence.delete(roomId);
        broadcastPresence(roomId);
    }

// Bloco local: `confirmLiveSession` concentra uma responsabilidade reutilizada dentro deste módulo.
    async function confirmLiveSession(socket: TabletopSocket): Promise<boolean> {
// Condição: altera o caminho de execução somente quando a regra indicada é verdadeira.
        if (Date.now() >= socket.data.accessTokenExpiresAt) return false;
// Constante ou estado local: `user` mantém o dado necessário ao fluxo abaixo.
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
// Constante ou estado local: `parsed` mantém o dado necessário ao fluxo abaixo.
                const parsed = roomJoinSchema.safeParse(payload);
// Condição: altera o caminho de execução somente quando a regra indicada é verdadeira.
                if (!parsed.success) {
                    sendError(socket, acknowledge, 'INVALID_PAYLOAD', 'Payload inválido.');
                    return;
                }
// Condição: altera o caminho de execução somente quando a regra indicada é verdadeira.
                if (!await confirmLiveSession(socket)) {
                    sendError(socket, acknowledge, 'AUTH_REQUIRED', 'Autenticação necessária.');
                    socket.disconnect(true);
                    return;
                }
// Condição: altera o caminho de execução somente quando a regra indicada é verdadeira.
                if (socket.data.roomId && socket.data.roomId !== parsed.data.roomId) {
                    sendError(socket, acknowledge, 'ALREADY_JOINED', 'Esta conexão já está associada a outra sala.');
                    return;
                }

// Bloco protegido: mantém o fluxo principal e suas finalizações ou tratamentos associados.
                try {
                    await serializeRoom(parsed.data.roomId, async () => {
                        await tabletopService.getRoomMembership(parsed.data.roomId, socket.data.userId);
// Constante ou estado local: `state` mantém o dado necessário ao fluxo abaixo.
                        const state = await tabletopService.getInitialState(
                            parsed.data.roomId,
                            socket.data.userId,
                        );
// Constante ou estado local: `messages` mantém o dado necessário ao fluxo abaixo.
                        const messages = await tabletopService.getRecentMessages(
                            parsed.data.roomId,
                            socket.data.userId,
                        );
// Condição: altera o caminho de execução somente quando a regra indicada é verdadeira.
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
// Constante ou estado local: `mapped` mantém o dado necessário ao fluxo abaixo.
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
// Constante ou estado local: `parsed` mantém o dado necessário ao fluxo abaixo.
                const parsed = messageSendSchema.safeParse(payload);
// Condição: altera o caminho de execução somente quando a regra indicada é verdadeira.
                if (!parsed.success) {
                    sendError(socket, acknowledge, 'INVALID_PAYLOAD', 'Payload inválido.');
                    return;
                }
// Constante ou estado local: `roomId` mantém o dado necessário ao fluxo abaixo.
                const roomId = socket.data.roomId;
// Condição: altera o caminho de execução somente quando a regra indicada é verdadeira.
                if (!roomId) {
                    sendError(socket, acknowledge, 'ROOM_NOT_JOINED', 'Entre em uma sala antes de enviar mensagens.');
                    return;
                }
// Condição: altera o caminho de execução somente quando a regra indicada é verdadeira.
                if (!await confirmLiveSession(socket)) {
                    sendError(socket, acknowledge, 'AUTH_REQUIRED', 'Autenticação necessária.');
                    socket.disconnect(true);
                    return;
                }

                await serializeRoom(roomId, async () => {
// Condição: altera o caminho de execução somente quando a regra indicada é verdadeira.
                    if (!await confirmLiveSession(socket)) {
                        sendError(socket, acknowledge, 'AUTH_REQUIRED', 'Autenticação necessária.');
                        socket.disconnect(true);
                        return;
                    }
                    await tabletopService.getRoomMembership(roomId, socket.data.userId);

                    let roll: ReturnType<typeof rollDiceExpression> | undefined;
// Condição: altera o caminho de execução somente quando a regra indicada é verdadeira.
                    if (isDiceExpressionCandidate(parsed.data.content)) {
// Bloco protegido: mantém o fluxo principal e suas finalizações ou tratamentos associados.
                        try {
                            roll = rollDiceExpression(parsed.data.content);
                        } catch (error) {
// Condição: altera o caminho de execução somente quando a regra indicada é verdadeira.
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
// Constante ou estado local: `message` mantém o dado necessário ao fluxo abaixo.
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
// Constante ou estado local: `mapped` mantém o dado necessário ao fluxo abaixo.
                const mapped = mapError(error);
// Condição: altera o caminho de execução somente quando a regra indicada é verdadeira.
                if (mapped.code === 'INTERNAL_ERROR') {
                    console.error('Falha ao salvar mensagem tabletop.');
                }
                sendError(socket, acknowledge, mapped.code, mapped.message);
            });
        });

        socket.on('tabletop:v1:token:add', (payload, acknowledge) => {
            void (async () => {
// Constante ou estado local: `parsed` mantém o dado necessário ao fluxo abaixo.
                const parsed = tokenAddSchema.safeParse(payload);
// Condição: altera o caminho de execução somente quando a regra indicada é verdadeira.
                if (!parsed.success) {
                    sendError(socket, acknowledge, 'INVALID_PAYLOAD', 'Payload inválido.');
                    return;
                }
// Constante ou estado local: `roomId` mantém o dado necessário ao fluxo abaixo.
                const roomId = socket.data.roomId;
// Condição: altera o caminho de execução somente quando a regra indicada é verdadeira.
                if (!roomId) {
                    sendError(socket, acknowledge, 'ROOM_NOT_JOINED', 'Entre em uma sala antes de enviar operações.');
                    return;
                }
// Condição: altera o caminho de execução somente quando a regra indicada é verdadeira.
                if (!await confirmLiveSession(socket)) {
                    sendError(socket, acknowledge, 'AUTH_REQUIRED', 'Autenticação necessária.');
                    socket.disconnect(true);
                    return;
                }
                await serializeRoom(roomId, async () => {
// Constante ou estado local: `token` mantém o dado necessário ao fluxo abaixo.
                    const token = await tabletopService.addToken(roomId, socket.data.userId, parsed.data.token);
                    io.to(socketRoom(roomId)).emit('tabletop:v1:token:added', { v: 1, token });
                    acknowledge?.({ v: 1, ok: true, token });
                });
            })().catch((error: unknown) => {
// Constante ou estado local: `mapped` mantém o dado necessário ao fluxo abaixo.
                const mapped = mapError(error);
// Condição: altera o caminho de execução somente quando a regra indicada é verdadeira.
                if (mapped.code === 'INTERNAL_ERROR') {
                    console.error('Falha ao adicionar token tabletop.');
                }
                sendError(socket, acknowledge, mapped.code, mapped.message);
            });
        });

        socket.on('tabletop:v1:token:move', (payload, acknowledge) => {
            void (async () => {
// Constante ou estado local: `parsed` mantém o dado necessário ao fluxo abaixo.
                const parsed = tokenMoveSchema.safeParse(payload);
// Condição: altera o caminho de execução somente quando a regra indicada é verdadeira.
                if (!parsed.success) {
                    sendError(socket, acknowledge, 'INVALID_PAYLOAD', 'Payload inválido.');
                    return;
                }
// Constante ou estado local: `roomId` mantém o dado necessário ao fluxo abaixo.
                const roomId = socket.data.roomId;
// Condição: altera o caminho de execução somente quando a regra indicada é verdadeira.
                if (!roomId) {
                    sendError(socket, acknowledge, 'ROOM_NOT_JOINED', 'Entre em uma sala antes de enviar operações.');
                    return;
                }
// Condição: altera o caminho de execução somente quando a regra indicada é verdadeira.
                if (!await confirmLiveSession(socket)) {
                    sendError(socket, acknowledge, 'AUTH_REQUIRED', 'Autenticação necessária.');
                    socket.disconnect(true);
                    return;
                }
                await serializeRoom(roomId, async () => {
// Constante ou estado local: `token` mantém o dado necessário ao fluxo abaixo.
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
// Constante ou estado local: `mapped` mantém o dado necessário ao fluxo abaixo.
                const mapped = mapError(error);
// Condição: altera o caminho de execução somente quando a regra indicada é verdadeira.
                if (mapped.code === 'INTERNAL_ERROR') {
                    console.error('Falha ao mover token tabletop.');
                }
                sendError(socket, acknowledge, mapped.code, mapped.message);
            });
        });

        socket.on('tabletop:v1:token:remove', (payload, acknowledge) => {
            void (async () => {
// Constante ou estado local: `parsed` mantém o dado necessário ao fluxo abaixo.
                const parsed = tokenRemoveSchema.safeParse(payload);
// Condição: altera o caminho de execução somente quando a regra indicada é verdadeira.
                if (!parsed.success) {
                    sendError(socket, acknowledge, 'INVALID_PAYLOAD', 'Payload inválido.');
                    return;
                }
// Constante ou estado local: `roomId` mantém o dado necessário ao fluxo abaixo.
                const roomId = socket.data.roomId;
// Condição: altera o caminho de execução somente quando a regra indicada é verdadeira.
                if (!roomId) {
                    sendError(socket, acknowledge, 'ROOM_NOT_JOINED', 'Entre em uma sala antes de enviar operações.');
                    return;
                }
// Condição: altera o caminho de execução somente quando a regra indicada é verdadeira.
                if (!await confirmLiveSession(socket)) {
                    sendError(socket, acknowledge, 'AUTH_REQUIRED', 'Autenticação necessária.');
                    socket.disconnect(true);
                    return;
                }
                await serializeRoom(roomId, async () => {
// Constante ou estado local: `removed` mantém o dado necessário ao fluxo abaixo.
                    const removed = await tabletopService.removeToken(roomId, socket.data.userId, parsed.data.tokenId);
                    io.to(socketRoom(roomId)).emit('tabletop:v1:token:removed', {
                        v: 1,
                        tokenId: removed.id,
                        sceneId: removed.sceneId,
                    });
                    acknowledge?.({ v: 1, ok: true, tokenId: removed.id });
                });
            })().catch((error: unknown) => {
// Constante ou estado local: `mapped` mantém o dado necessário ao fluxo abaixo.
                const mapped = mapError(error);
// Condição: altera o caminho de execução somente quando a regra indicada é verdadeira.
                if (mapped.code === 'INTERNAL_ERROR') {
                    console.error('Falha ao remover token tabletop.');
                }
                sendError(socket, acknowledge, mapped.code, mapped.message);
            });
        });

        socket.on('disconnect', () => {
// Constante ou estado local: `roomId` mantém o dado necessário ao fluxo abaixo.
            const roomId = socket.data.roomId;
// Condição: altera o caminho de execução somente quando a regra indicada é verdadeira.
            if (!roomId) return;
            removePresence(roomId, socket);
        });
    });

    return io;
}
