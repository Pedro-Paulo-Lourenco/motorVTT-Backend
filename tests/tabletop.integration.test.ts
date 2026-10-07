import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { request as httpRequest, type IncomingHttpHeaders } from 'node:http';
import { after, before, describe, it } from 'node:test';
import { once } from 'node:events';
import { spawnSync } from 'node:child_process';

import { io as createClient, type Socket } from 'socket.io-client';
import type { Express } from 'express';
import { apiSuccessSchema, authResponseSchema, roomSchema } from '@motor-vtt/contracts';

import app from '../src/app.js';
import { closeDatabase, pool } from '../src/config/database.js';
import { createTabletopGateway } from '../src/realtime/tabletop.gateway.js';
import { tabletopService } from '../src/services/tabletop.service.js';

type HttpResult = {
    statusCode: number;
    headers: IncomingHttpHeaders;
    body: Record<string, any>;
};

type Account = { userId: string; cookie: string };
type Ack = {
    v: 1;
    ok: boolean;
    error?: { code: string; message: string };
    token?: { id: string; cenaId: string; nome: string; x: number; y: number };
    tokenId?: string;
};

async function request(
    baseUrl: string,
    path: string,
    options: { method?: string; body?: Record<string, unknown>; cookie?: string } = {},
): Promise<HttpResult> {
    return new Promise((resolve, reject) => {
        const outgoing = httpRequest(new URL(path, baseUrl), {
            method: options.method ?? 'GET',
            headers: {
                ...(options.body === undefined ? {} : { 'content-type': 'application/json' }),
                ...(options.cookie === undefined ? {} : { cookie: options.cookie }),
            },
        }, (response) => {
            const chunks: Buffer[] = [];
            response.on('data', (chunk: Buffer) => chunks.push(chunk));
            response.on('end', () => {
                try {
                    resolve({
                        statusCode: response.statusCode ?? 0,
                        headers: response.headers,
                        body: JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, any>,
                    });
                } catch (error) {
                    reject(error);
                }
            });
        });
        outgoing.on('error', reject);
        if (options.body !== undefined) outgoing.write(JSON.stringify(options.body));
        outgoing.end();
    });
}

function cookiePair(headers: IncomingHttpHeaders, name: string): string {
    const found = headers['set-cookie']?.find((cookie) => cookie.startsWith(`${name}=`));
    assert.ok(found, `cookie ${name} ausente`);
    return found.split(';', 1)[0] as string;
}

async function registerAccount(baseUrl: string, name: string): Promise<Account> {
    const response = await request(baseUrl, '/api/auth/register', {
        method: 'POST',
        body: {
            nome: name,
            email: `tabletop-test-${randomUUID()}@example.test`,
            password: 'Senha!DeTeste2026',
        },
    });
    assert.equal(response.statusCode, 201);
    const auth = apiSuccessSchema(authResponseSchema).parse(response.body).data;
    return {
        userId: auth.user.id,
        cookie: cookiePair(response.headers, 'access_token'),
    };
}

async function createRoom(baseUrl: string, account: Account, name: string): Promise<string> {
    const response = await request(baseUrl, '/api/rooms', {
        method: 'POST',
        body: { nome: name },
        cookie: account.cookie,
    });
    assert.equal(response.statusCode, 201);
    return apiSuccessSchema(roomSchema).parse(response.body).data.id;
}

function connect(baseUrl: string, cookie?: string): Promise<Socket> {
    const socket = createClient(baseUrl, {
        autoConnect: false,
        reconnection: false,
        transports: ['websocket'],
        ...(cookie === undefined ? {} : { extraHeaders: { cookie } }),
    });
    return new Promise((resolve, reject) => {
        socket.once('connect', () => resolve(socket));
        socket.once('connect_error', (error) => reject(error));
        socket.connect();
    });
}

function waitForEvent<T>(
    socket: Socket,
    eventName: string,
    predicate: (payload: T) => boolean = () => true,
): Promise<T> {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            socket.off(eventName, listener);
            reject(new Error(`Timeout aguardando ${eventName}`));
        }, 5_000);
        const listener = (payload: T) => {
            if (!predicate(payload)) return;
            clearTimeout(timer);
            socket.off(eventName, listener);
            resolve(payload);
        };
        socket.on(eventName, listener);
    });
}

function emitAck(socket: Socket, eventName: string, payload: unknown): Promise<Ack> {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`Timeout aguardando confirmação de ${eventName}`)), 5_000);
        socket.emit(eventName, payload, (response: Ack) => {
            clearTimeout(timer);
            resolve(response);
        });
    });
}

async function expectNoEvent(socket: Socket, eventName: string, durationMs = 150): Promise<void> {
    const observed = await Promise.race([
        waitForEvent(socket, eventName).then(() => true),
        new Promise<false>((resolve) => setTimeout(() => resolve(false), durationMs)),
    ]);
    assert.equal(observed, false, `evento inesperado ${eventName}`);
}

const runId = randomUUID();
const roomNamePrefix = `tabletop-test-${runId}`;
let server: ReturnType<typeof createServer>;
let gateway: ReturnType<typeof createTabletopGateway>;
let baseUrl: string;
let migrationsReady = false;
const sockets: Socket[] = [];

before(async () => {
    const migration = spawnSync(process.execPath, ['--import', 'tsx', 'src/database/cli.ts', 'up'], {
        cwd: process.cwd(),
        encoding: 'utf8',
        env: process.env,
    });
    assert.equal(migration.status, 0, `${migration.stdout}\n${migration.stderr}`);
    migrationsReady = true;

    server = createServer(app as Express);
    gateway = createTabletopGateway(server);
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => {
    for (const socket of sockets) socket.disconnect();
    if (gateway) await new Promise<void>((resolve) => gateway.close(() => resolve()));
    if (!migrationsReady) return;
    await pool.query('DELETE FROM rooms WHERE nome LIKE ?', [`${roomNamePrefix}%`]);
    await pool.query('DELETE FROM assets WHERE nome LIKE ?', [`${roomNamePrefix}%`]);
    await pool.query("DELETE FROM users WHERE email LIKE 'tabletop-test-%@example.test'");
    await closeDatabase();
});

describe('Socket.IO tabletop autenticado', () => {
    it('valida sessão e participação, isola salas, autoriza o mestre e sincroniza estado, tokens e presença', async () => {
        const rejected = await new Promise<boolean>((resolve) => {
            const anonymous = createClient(baseUrl, {
                autoConnect: false,
                reconnection: false,
                transports: ['websocket'],
            });
            anonymous.once('connect', () => {
                anonymous.disconnect();
                resolve(false);
            });
            anonymous.once('connect_error', () => resolve(true));
            anonymous.connect();
        });
        assert.equal(rejected, true, 'conexões sem cookie válido devem ser recusadas');

        const masterA = await registerAccount(baseUrl, 'Mestre A');
        const playerA = await registerAccount(baseUrl, 'Jogador A');
        const masterB = await registerAccount(baseUrl, 'Mestre B');
        const outsider = await registerAccount(baseUrl, 'Visitante');
        const roomA = await createRoom(baseUrl, masterA, `${roomNamePrefix}-a`);
        const roomB = await createRoom(baseUrl, masterB, `${roomNamePrefix}-b`);

        const joinedPlayer = await request(baseUrl, '/api/rooms/join', {
            method: 'POST',
            body: {
                codigoConvite: (await request(baseUrl, `/api/rooms/${roomA}`, { cookie: masterA.cookie }))
                    .body.data.sala.codigoConvite as string,
            },
            cookie: playerA.cookie,
        });
        assert.equal(joinedPlayer.statusCode, 201);

        const socketA = await connect(baseUrl, masterA.cookie);
        const playerSocket = await connect(baseUrl, playerA.cookie);
        const socketB = await connect(baseUrl, masterB.cookie);
        const outsiderSocket = await connect(baseUrl, outsider.cookie);
        sockets.push(socketA, playerSocket, socketB, outsiderSocket);

        const stateAEvent = waitForEvent<{ v: number; roomId: string; board: unknown; scene: {
            id: string;
            backgroundUrl?: string | null;
            gridConfig: { enabled: boolean; size: number };
        }; tokens: unknown[] }>(socketA, 'tabletop:v1:state');
        const joinA = await emitAck(socketA, 'tabletop:v1:join', { v: 1, roomId: roomA });
        assert.equal(joinA.ok, true);
        const stateA = await stateAEvent;
        assert.equal(stateA.v, 1);
        assert.equal(stateA.roomId, roomA);
        assert.ok(stateA.board);
        assert.equal(stateA.scene.gridConfig.enabled, true);
        assert.ok(stateA.scene.gridConfig.size > 0);
        assert.deepEqual(stateA.tokens, []);

        const statePlayerEvent = waitForEvent<{ roomId: string }>(playerSocket, 'tabletop:v1:state');
        assert.equal(
            (await emitAck(playerSocket, 'tabletop:v1:join', { v: 1, roomId: roomA })).ok,
            true,
        );
        assert.equal((await statePlayerEvent).roomId, roomA);

        const stateBEvent = waitForEvent<{ roomId: string }>(socketB, 'tabletop:v1:state');
        assert.equal((await emitAck(socketB, 'tabletop:v1:join', { v: 1, roomId: roomB })).ok, true);
        assert.equal((await stateBEvent).roomId, roomB);

        const outsiderJoin = await emitAck(outsiderSocket, 'tabletop:v1:join', { v: 1, roomId: roomA });
        assert.equal(outsiderJoin.ok, false);
        assert.equal(outsiderJoin.error?.code, 'ROOM_ACCESS_DENIED');

        const assetId = randomUUID();
        await pool.query(
            `INSERT INTO assets (id, sala_id, nome, tipo, url, visibilidade)
             VALUES (?, ?, ?, 'TOKEN', ?, 'SALA')`,
            [assetId, roomA, `${roomNamePrefix}-asset`, 'https://example.test/token.png'],
        );

        const playerAdd = await emitAck(playerSocket, 'tabletop:v1:token:add', {
            v: 1,
            token: { nome: 'Jogador não autorizado', x: 1, y: 2, escala: 1 },
        });
        assert.equal(playerAdd.ok, false);
        assert.equal(playerAdd.error?.code, 'MASTER_REQUIRED');

        const invalidPayload = await emitAck(socketA, 'tabletop:v1:token:add', {
            v: 1,
            token: { nome: '', x: 'fora-do-grid', y: 2, escala: 0 },
        });
        assert.equal(invalidPayload.ok, false);
        assert.equal(invalidPayload.error?.code, 'INVALID_PAYLOAD');

        let roomBReceivedToken = false;
        const roomBTokenListener = () => { roomBReceivedToken = true; };
        socketB.on('tabletop:v1:token:added', roomBTokenListener);
        const tokenAddedEvent = waitForEvent<{ token: { id: string; assetOrigemId?: string | null } }>(
            playerSocket,
            'tabletop:v1:token:added',
        );
        const added = await emitAck(socketA, 'tabletop:v1:token:add', {
            v: 1,
            token: { nome: 'Goblin', x: 64, y: 96, escala: 1, assetOrigemId: assetId },
        });
        assert.equal(added.ok, true);
        assert.ok(added.token?.id);
        assert.equal((await tokenAddedEvent).token.assetOrigemId, assetId);
        await new Promise((resolve) => setTimeout(resolve, 200));
        socketB.off('tabletop:v1:token:added', roomBTokenListener);
        assert.equal(roomBReceivedToken, false, 'eventos de token não devem atravessar salas');

        const playerMove = await emitAck(playerSocket, 'tabletop:v1:token:move', {
            v: 1,
            tokenId: added.token!.id,
            x: 128,
            y: 160,
        });
        assert.equal(playerMove.ok, false);
        assert.equal(playerMove.error?.code, 'MASTER_REQUIRED');

        const movedEvent = waitForEvent<{ token: { id: string; x: number; y: number } }>(
            playerSocket,
            'tabletop:v1:token:moved',
        );
        const moved = await emitAck(socketA, 'tabletop:v1:token:move', {
            v: 1,
            tokenId: added.token!.id,
            x: 128,
            y: 160,
        });
        assert.equal(moved.ok, true, JSON.stringify(moved));
        assert.deepEqual(
            (({ x, y }) => ({ x, y }))((await movedEvent).token),
            { x: 128, y: 160 },
        );

        const initialAfterMove = await tabletopService.getInitialState(roomA, masterA.userId);
        assert.equal(initialAfterMove.tokens[0]?.id, added.token!.id);
        assert.equal(initialAfterMove.tokens[0]?.x, 128);

        const presenceAfterSecondSocket = waitForEvent<{ onlineUserIds: string[] }>(
            socketA,
            'tabletop:v1:presence',
            (presence) => presence.onlineUserIds.includes(masterA.userId),
        );
        const duplicateMasterSocket = await connect(baseUrl, masterA.cookie);
        sockets.push(duplicateMasterSocket);
        const duplicateStateEvent = waitForEvent(duplicateMasterSocket, 'tabletop:v1:state');
        assert.equal((await emitAck(duplicateMasterSocket, 'tabletop:v1:join', { v: 1, roomId: roomA })).ok, true);
        await duplicateStateEvent;
        const duplicatePresence = await presenceAfterSecondSocket;
        assert.equal(duplicatePresence.onlineUserIds.filter((userId) => userId === masterA.userId).length, 1);

        let masterWentOffline = false;
        const offlineListener = (presence: { onlineUserIds: string[] }) => {
            if (!presence.onlineUserIds.includes(masterA.userId)) masterWentOffline = true;
        };
        playerSocket.on('tabletop:v1:presence', offlineListener);
        duplicateMasterSocket.disconnect();
        await new Promise((resolve) => setTimeout(resolve, 150));
        assert.equal(masterWentOffline, false, 'uma conexão restante mantém o usuário online');

        const presenceAfterMasterDisconnect = waitForEvent<{ onlineUserIds: string[] }>(
            playerSocket,
            'tabletop:v1:presence',
            (presence) => !presence.onlineUserIds.includes(masterA.userId),
        );
        socketA.disconnect();
        assert.ok(!(await presenceAfterMasterDisconnect).onlineUserIds.includes(masterA.userId));
        playerSocket.off('tabletop:v1:presence', offlineListener);

        const removedEvent = waitForEvent<{ tokenId: string }>(playerSocket, 'tabletop:v1:token:removed');
        const removed = await emitAck(playerSocket, 'tabletop:v1:token:remove', {
            v: 1,
            tokenId: added.token!.id,
        });
        assert.equal(removed.ok, false);
        assert.equal(removed.error?.code, 'MASTER_REQUIRED');

        const lastMasterSocket = await connect(baseUrl, masterA.cookie);
        sockets.push(lastMasterSocket);
        const finalStateEvent = waitForEvent(lastMasterSocket, 'tabletop:v1:state');
        const removeAck = await emitAck(lastMasterSocket, 'tabletop:v1:join', { v: 1, roomId: roomA });
        assert.equal(removeAck.ok, true);
        await finalStateEvent;
        const removedToken = await emitAck(lastMasterSocket, 'tabletop:v1:token:remove', {
            v: 1,
            tokenId: added.token!.id,
        });
        assert.equal(removedToken.ok, true);
        assert.equal((await removedEvent).tokenId, added.token!.id);
        const finalState = await tabletopService.getInitialState(roomA, masterA.userId);
        assert.deepEqual(finalState.tokens, []);

        const [assets] = await pool.query<Array<{ id: string }>>('SELECT id FROM assets WHERE id = ?', [assetId]);
        assert.equal(assets.length, 1, 'remover token não deve apagar o asset de origem');
    });

    it('entrega e persiste chat e rolagens apenas para participantes, calculando dados no servidor', async () => {
        const master = await registerAccount(baseUrl, 'Mestre do chat');
        const player = await registerAccount(baseUrl, 'Jogador do chat');
        const otherMaster = await registerAccount(baseUrl, 'Mestre de outra sala');
        const outsider = await registerAccount(baseUrl, 'Visitante do chat');
        const roomA = await createRoom(baseUrl, master, `${roomNamePrefix}-chat-a`);
        const roomB = await createRoom(baseUrl, otherMaster, `${roomNamePrefix}-chat-b`);
        const roomDetails = await request(baseUrl, `/api/rooms/${roomA}`, { cookie: master.cookie });
        const joinPlayer = await request(baseUrl, '/api/rooms/join', {
            method: 'POST',
            body: { codigoConvite: roomDetails.body.data.sala.codigoConvite as string },
            cookie: player.cookie,
        });
        assert.equal(joinPlayer.statusCode, 201);

        const masterSocket = await connect(baseUrl, master.cookie);
        const playerSocket = await connect(baseUrl, player.cookie);
        const otherRoomSocket = await connect(baseUrl, otherMaster.cookie);
        const outsiderSocket = await connect(baseUrl, outsider.cookie);
        sockets.push(masterSocket, playerSocket, otherRoomSocket, outsiderSocket);

        const joins = [
            [masterSocket, roomA],
            [playerSocket, roomA],
            [otherRoomSocket, roomB],
        ] as const;
        for (const [socket, roomId] of joins) {
            const stateEvent = waitForEvent<{ roomId: string }>(socket, 'tabletop:v1:state');
            assert.equal((await emitAck(socket, 'tabletop:v1:join', { v: 1, roomId })).ok, true);
            assert.equal((await stateEvent).roomId, roomId);
        }

        const outsiderJoin = await emitAck(outsiderSocket, 'tabletop:v1:join', { v: 1, roomId: roomA });
        assert.equal(outsiderJoin.ok, false);
        assert.equal(outsiderJoin.error?.code, 'ROOM_ACCESS_DENIED');
        const notJoined = await emitAck(outsiderSocket, 'tabletop:v1:message:send', {
            v: 1,
            content: 'Sem sala',
        });
        assert.equal(notJoined.ok, false);
        assert.equal(notJoined.error?.code, 'ROOM_NOT_JOINED');

        const roomBMessages: Array<{ message: { conteudo: string } }> = [];
        const roomBListener = (event: { message: { conteudo: string } }) => roomBMessages.push(event);
        otherRoomSocket.on('tabletop:v1:message:created', roomBListener);

        const chatFromPlayer = waitForEvent<{ v: number; message: { tipo: string; conteudo: string; autorId: string } }>(
            masterSocket,
            'tabletop:v1:message:created',
            (event) => event.message.conteudo === 'Olá, sala!',
        );
        const chatToSender = waitForEvent<{ message: { id: string } }>(
            playerSocket,
            'tabletop:v1:message:created',
            (event) => event.message.conteudo === 'Olá, sala!',
        );
        const chatAck = await emitAck(playerSocket, 'tabletop:v1:message:send', {
            v: 1,
            content: 'Olá, sala!',
        });
        assert.equal(chatAck.ok, true);
        const chat = await chatFromPlayer;
        assert.equal(chat.message.tipo, 'CHAT');
        assert.equal(chat.message.autorId, player.userId);
        assert.equal((await chatToSender).message.id, chat.message.id);

        const invalidClientResult = await emitAck(playerSocket, 'tabletop:v1:message:send', {
            v: 1,
            content: '2d4+2',
            result: 999,
        });
        assert.equal(invalidClientResult.ok, false);
        assert.equal(invalidClientResult.error?.code, 'INVALID_PAYLOAD');

        const oversizedMessage = await emitAck(playerSocket, 'tabletop:v1:message:send', {
            v: 1,
            content: 'x'.repeat(1001),
        });
        assert.equal(oversizedMessage.ok, false);
        assert.equal(oversizedMessage.error?.code, 'INVALID_PAYLOAD');

        const invalidExpression = await emitAck(playerSocket, 'tabletop:v1:message:send', {
            v: 1,
            content: '101d6',
        });
        assert.equal(invalidExpression.ok, false);
        assert.equal(invalidExpression.error?.code, 'INVALID_DICE_EXPRESSION');

        const rollFromPlayer = waitForEvent<{
            message: {
                tipo: string;
                conteudo: string;
                metadata: { roll: { repetitions: Array<{ dice: Array<{ rolls: number[] }>; total: number }> } };
            };
        }>(
            masterSocket,
            'tabletop:v1:message:created',
            (event) => event.message.conteudo === '3#5d20',
        );
        const rollToSender = waitForEvent<{ message: { conteudo: string } }>(
            playerSocket,
            'tabletop:v1:message:created',
            (event) => event.message.conteudo === '3#5d20',
        );
        const rollAck = await emitAck(playerSocket, 'tabletop:v1:message:send', {
            v: 1,
            content: '3#5d20',
        });
        assert.equal(rollAck.ok, true);
        const roll = await rollFromPlayer;
        assert.equal(roll.message.tipo, 'ROLAGEM');
        assert.equal(roll.message.metadata.roll.repetitions.length, 3);
        assert.deepEqual(roll.message.metadata.roll.repetitions.map((repeat) => repeat.dice.length), [5, 5, 5]);
        assert.ok(roll.message.metadata.roll.repetitions.every((repeat) =>
            repeat.dice.every((die) => die.rolls.every((value) => value >= 1 && value <= 20))
            && repeat.total === repeat.dice.flatMap((die) => die.rolls).reduce((sum, value) => sum + value, 0)));
        assert.equal((await rollToSender).message.conteudo, '3#5d20');

        await new Promise((resolve) => setTimeout(resolve, 200));
        otherRoomSocket.off('tabletop:v1:message:created', roomBListener);
        assert.deepEqual(roomBMessages, [], 'mensagens não devem atravessar salas');

        const [persisted] = await pool.query<Array<{ tipo: string; metadata: unknown }>>(
            'SELECT tipo, metadata FROM message_logs WHERE sala_id = ? ORDER BY created_at ASC',
            [roomA],
        );
        assert.deepEqual(persisted.map((message) => message.tipo), ['CHAT', 'ROLAGEM']);
        assert.ok(persisted[1]?.metadata);

        const duplicateSocket = await connect(baseUrl, master.cookie);
        sockets.push(duplicateSocket);
        const historyEvent = waitForEvent<{
            roomId: string;
            messages: Array<{ conteudo: string }>;
        }>(duplicateSocket, 'tabletop:v1:messages');
        const duplicateState = waitForEvent(duplicateSocket, 'tabletop:v1:state');
        assert.equal((await emitAck(duplicateSocket, 'tabletop:v1:join', { v: 1, roomId: roomA })).ok, true);
        await duplicateState;
        assert.equal((await historyEvent).messages.length, 2);
    });
});
