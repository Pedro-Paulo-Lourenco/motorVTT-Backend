import { uuidSchema } from '@motor-vtt/contracts';
import { Server } from 'socket.io';
import { z } from 'zod';
import { env } from '../config/env.js';
import { HttpError } from '../http/errors.js';
import { authService, verifyAccessToken } from '../services/auth.service.js';
import { tabletopService, tokenCreateSchema, } from '../services/tabletop.service.js';
import { DiceSyntaxError, isDiceExpressionCandidate, rollDiceExpression, } from '../services/dice-roller.js';
import { registerSheetSocketHandler } from '../sockets/sheetSocketHandler.js';
const roomJoinSchema = z.strictObject({
    v: z.literal(1),
    roomId: uuidSchema,
});
const messageSendSchema = z.strictObject({
    v: z.literal(1),
    content: z.string().trim().min(1).max(1000),
});
const tokenAddSchema = z.strictObject({
    v: z.literal(1),
    token: tokenCreateSchema,
});
const tokenMoveSchema = z.strictObject({
    v: z.literal(1),
    tokenId: uuidSchema,
    x: z.number().finite(),
    y: z.number().finite(),
});
const tokenRemoveSchema = z.strictObject({
    v: z.literal(1),
    tokenId: uuidSchema,
});
function socketRoom(roomId) {
    return `tabletop:v1:room:${roomId}`;
}
function readAccessCookie(cookieHeader) {
    if (!cookieHeader)
        return undefined;
    const headers = Array.isArray(cookieHeader) ? cookieHeader : [cookieHeader];
    for (const header of headers) {
        for (const item of header.split(';')) {
            const separator = item.indexOf('=');
            if (separator < 0 || item.slice(0, separator).trim() !== 'access_token')
                continue;
            const token = item.slice(separator + 1).trim();
            return token.length > 0 ? token : undefined;
        }
    }
    return undefined;
}
function sendError(socket, acknowledge, code, message) {
    const error = { v: 1, code, message };
    if (acknowledge)
        acknowledge({ v: 1, ok: false, error });
    else
        socket.emit('tabletop:v1:error', error);
}
function mapError(error) {
    if (error instanceof HttpError) {
        if (error.code === 'MASTER_REQUIRED') {
            return { code: 'MASTER_REQUIRED', message: 'Somente o mestre pode alterar tokens.' };
        }
        if (error.code === 'TOKEN_NOT_FOUND') {
            return { code: 'TOKEN_NOT_FOUND', message: 'Token não encontrado.' };
        }
        if (error.code === 'ROOM_NOT_FOUND') {
            return { code: 'ROOM_ACCESS_DENIED', message: 'Acesso à sala não autorizado.' };
        }
    }
    return { code: 'INTERNAL_ERROR', message: 'Não foi possível concluir a operação.' };
}
export function createTabletopGateway(httpServer) {
    const io = new Server(httpServer, {
        cors: {
            origin: env.CORS_ORIGIN,
            credentials: true,
        },
        allowRequest: (request, callback) => {
            const origin = request.headers.origin;
            callback(null, origin === undefined || origin === env.CORS_ORIGIN);
        },
    });
    const roomPresence = new Map();
    const roomQueues = new Map();
    async function serializeRoom(roomId, operation) {
        const previous = roomQueues.get(roomId) ?? Promise.resolve();
        let release = () => { };
        const current = new Promise((resolve) => {
            release = resolve;
        });
        roomQueues.set(roomId, current);
        await previous;
        try {
            return await operation();
        }
        finally {
            release();
            if (roomQueues.get(roomId) === current)
                roomQueues.delete(roomId);
        }
    }
    io.use((socket, next) => {
        const token = readAccessCookie(socket.handshake.headers.cookie);
        const payload = token === undefined ? undefined : verifyAccessToken(token);
        if (!payload) {
            next(new Error('UNAUTHORIZED'));
            return;
        }
        void authService.authenticatedUser(payload).then((user) => {
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
    function onlineUserIds(roomId) {
        return [...(roomPresence.get(roomId)?.entries() ?? [])]
            .filter(([, socketIds]) => socketIds.size > 0)
            .map(([userId]) => userId)
            .sort();
    }
    function broadcastPresence(roomId) {
        io.to(socketRoom(roomId)).emit('tabletop:v1:presence', {
            v: 1,
            roomId,
            onlineUserIds: onlineUserIds(roomId),
        });
    }
    function addPresence(roomId, socket) {
        let participants = roomPresence.get(roomId);
        if (!participants) {
            participants = new Map();
            roomPresence.set(roomId, participants);
        }
        let socketIds = participants.get(socket.data.userId);
        if (!socketIds) {
            socketIds = new Set();
            participants.set(socket.data.userId, socketIds);
        }
        socketIds.add(socket.id);
    }
    function removePresence(roomId, socket) {
        const participants = roomPresence.get(roomId);
        const socketIds = participants?.get(socket.data.userId);
        if (!participants || !socketIds)
            return;
        socketIds.delete(socket.id);
        if (socketIds.size > 0)
            return;
        participants.delete(socket.data.userId);
        if (participants.size === 0)
            roomPresence.delete(roomId);
        broadcastPresence(roomId);
    }
    async function confirmLiveSession(socket) {
        if (Date.now() >= socket.data.accessTokenExpiresAt)
            return false;
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
                const parsed = roomJoinSchema.safeParse(payload);
                if (!parsed.success) {
                    sendError(socket, acknowledge, 'INVALID_PAYLOAD', 'Payload inválido.');
                    return;
                }
                if (!await confirmLiveSession(socket)) {
                    sendError(socket, acknowledge, 'AUTH_REQUIRED', 'Autenticação necessária.');
                    socket.disconnect(true);
                    return;
                }
                if (socket.data.roomId && socket.data.roomId !== parsed.data.roomId) {
                    sendError(socket, acknowledge, 'ALREADY_JOINED', 'Esta conexão já está associada a outra sala.');
                    return;
                }
                try {
                    await serializeRoom(parsed.data.roomId, async () => {
                        await tabletopService.getRoomMembership(parsed.data.roomId, socket.data.userId);
                        const state = await tabletopService.getInitialState(parsed.data.roomId, socket.data.userId);
                        const messages = await tabletopService.getRecentMessages(parsed.data.roomId, socket.data.userId);
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
                }
                catch (error) {
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
                const parsed = messageSendSchema.safeParse(payload);
                if (!parsed.success) {
                    sendError(socket, acknowledge, 'INVALID_PAYLOAD', 'Payload inválido.');
                    return;
                }
                const roomId = socket.data.roomId;
                if (!roomId) {
                    sendError(socket, acknowledge, 'ROOM_NOT_JOINED', 'Entre em uma sala antes de enviar mensagens.');
                    return;
                }
                if (!await confirmLiveSession(socket)) {
                    sendError(socket, acknowledge, 'AUTH_REQUIRED', 'Autenticação necessária.');
                    socket.disconnect(true);
                    return;
                }
                await serializeRoom(roomId, async () => {
                    if (!await confirmLiveSession(socket)) {
                        sendError(socket, acknowledge, 'AUTH_REQUIRED', 'Autenticação necessária.');
                        socket.disconnect(true);
                        return;
                    }
                    await tabletopService.getRoomMembership(roomId, socket.data.userId);
                    let roll;
                    if (isDiceExpressionCandidate(parsed.data.content)) {
                        try {
                            roll = rollDiceExpression(parsed.data.content);
                        }
                        catch (error) {
                            if (error instanceof DiceSyntaxError) {
                                sendError(socket, acknowledge, 'INVALID_DICE_EXPRESSION', 'A expressão de rolagem é inválida ou excede um limite permitido.');
                                return;
                            }
                            throw error;
                        }
                    }
                    const message = await tabletopService.createMessage(roomId, socket.data.userId, parsed.data.content, roll);
                    io.to(socketRoom(roomId)).emit('tabletop:v1:message:created', { v: 1, message });
                    acknowledge?.({ v: 1, ok: true });
                });
            })().catch((error) => {
                const mapped = mapError(error);
                if (mapped.code === 'INTERNAL_ERROR') {
                    console.error('Falha ao salvar mensagem tabletop.');
                }
                sendError(socket, acknowledge, mapped.code, mapped.message);
            });
        });
        socket.on('tabletop:v1:token:add', (payload, acknowledge) => {
            void (async () => {
                const parsed = tokenAddSchema.safeParse(payload);
                if (!parsed.success) {
                    sendError(socket, acknowledge, 'INVALID_PAYLOAD', 'Payload inválido.');
                    return;
                }
                const roomId = socket.data.roomId;
                if (!roomId) {
                    sendError(socket, acknowledge, 'ROOM_NOT_JOINED', 'Entre em uma sala antes de enviar operações.');
                    return;
                }
                if (!await confirmLiveSession(socket)) {
                    sendError(socket, acknowledge, 'AUTH_REQUIRED', 'Autenticação necessária.');
                    socket.disconnect(true);
                    return;
                }
                await serializeRoom(roomId, async () => {
                    const token = await tabletopService.addToken(roomId, socket.data.userId, parsed.data.token);
                    io.to(socketRoom(roomId)).emit('tabletop:v1:token:added', { v: 1, token });
                    acknowledge?.({ v: 1, ok: true, token });
                });
            })().catch((error) => {
                const mapped = mapError(error);
                if (mapped.code === 'INTERNAL_ERROR') {
                    console.error('Falha ao adicionar token tabletop.');
                }
                sendError(socket, acknowledge, mapped.code, mapped.message);
            });
        });
        socket.on('tabletop:v1:token:move', (payload, acknowledge) => {
            void (async () => {
                const parsed = tokenMoveSchema.safeParse(payload);
                if (!parsed.success) {
                    sendError(socket, acknowledge, 'INVALID_PAYLOAD', 'Payload inválido.');
                    return;
                }
                const roomId = socket.data.roomId;
                if (!roomId) {
                    sendError(socket, acknowledge, 'ROOM_NOT_JOINED', 'Entre em uma sala antes de enviar operações.');
                    return;
                }
                if (!await confirmLiveSession(socket)) {
                    sendError(socket, acknowledge, 'AUTH_REQUIRED', 'Autenticação necessária.');
                    socket.disconnect(true);
                    return;
                }
                await serializeRoom(roomId, async () => {
                    const token = await tabletopService.moveToken(roomId, socket.data.userId, parsed.data.tokenId, parsed.data.x, parsed.data.y);
                    io.to(socketRoom(roomId)).emit('tabletop:v1:token:moved', { v: 1, token });
                    acknowledge?.({ v: 1, ok: true, token });
                });
            })().catch((error) => {
                const mapped = mapError(error);
                if (mapped.code === 'INTERNAL_ERROR') {
                    console.error('Falha ao mover token tabletop.');
                }
                sendError(socket, acknowledge, mapped.code, mapped.message);
            });
        });
        socket.on('tabletop:v1:token:remove', (payload, acknowledge) => {
            void (async () => {
                const parsed = tokenRemoveSchema.safeParse(payload);
                if (!parsed.success) {
                    sendError(socket, acknowledge, 'INVALID_PAYLOAD', 'Payload inválido.');
                    return;
                }
                const roomId = socket.data.roomId;
                if (!roomId) {
                    sendError(socket, acknowledge, 'ROOM_NOT_JOINED', 'Entre em uma sala antes de enviar operações.');
                    return;
                }
                if (!await confirmLiveSession(socket)) {
                    sendError(socket, acknowledge, 'AUTH_REQUIRED', 'Autenticação necessária.');
                    socket.disconnect(true);
                    return;
                }
                await serializeRoom(roomId, async () => {
                    const removed = await tabletopService.removeToken(roomId, socket.data.userId, parsed.data.tokenId);
                    io.to(socketRoom(roomId)).emit('tabletop:v1:token:removed', {
                        v: 1,
                        tokenId: removed.id,
                        sceneId: removed.sceneId,
                    });
                    acknowledge?.({ v: 1, ok: true, tokenId: removed.id });
                });
            })().catch((error) => {
                const mapped = mapError(error);
                if (mapped.code === 'INTERNAL_ERROR') {
                    console.error('Falha ao remover token tabletop.');
                }
                sendError(socket, acknowledge, mapped.code, mapped.message);
            });
        });
        socket.on('disconnect', () => {
            const roomId = socket.data.roomId;
            if (!roomId)
                return;
            removePresence(roomId, socket);
        });
    });
    return io;
}
//# sourceMappingURL=tabletop.gateway.js.map