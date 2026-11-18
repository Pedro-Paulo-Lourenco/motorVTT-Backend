/** Exercita presença, mensagens e tokens via Socket.IO integrado. */
// Importações: reúnem bibliotecas, tipos e módulos locais usados pelos blocos seguintes.
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

// Tipo: `HttpResult` descreve o formato estruturado usado nas operações relacionadas.
type HttpResult = {
    statusCode: number;
    headers: IncomingHttpHeaders;
    body: Record<string, any>;
};

// Tipo: `Account` descreve o formato estruturado usado nas operações relacionadas.
type Account = { userId: string; cookie: string };
// Tipo: `Ack` descreve o formato estruturado usado nas operações relacionadas.
type Ack = {
    v: 1;
    ok: boolean;
    error?: { code: string; message: string };
    token?: { id: string; cenaId: string; nome: string; x: number; y: number };
    tokenId?: string;
};

// Bloco local: `request` concentra uma responsabilidade reutilizada dentro deste módulo.
async function request(
    baseUrl: string,
    path: string,
    options: { method?: string; body?: Record<string, unknown>; cookie?: string } = {},
): Promise<HttpResult> {
    return new Promise((resolve, reject) => {
// Constante ou estado local: `outgoing` mantém o dado necessário ao fluxo abaixo.
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
// Bloco protegido: mantém o fluxo principal e suas finalizações ou tratamentos associados.
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
// Condição: altera o caminho de execução somente quando a regra indicada é verdadeira.
        if (options.body !== undefined) outgoing.write(JSON.stringify(options.body));
        outgoing.end();
    });
}

// Bloco local: `cookiePair` concentra uma responsabilidade reutilizada dentro deste módulo.
function cookiePair(headers: IncomingHttpHeaders, name: string): string {
// Constante ou estado local: `found` mantém o dado necessário ao fluxo abaixo.
    const found = headers['set-cookie']?.find((cookie) => cookie.startsWith(`${name}=`));
    assert.ok(found, `cookie ${name} ausente`);
    return found.split(';', 1)[0] as string;
}

// Bloco local: `registerAccount` concentra uma responsabilidade reutilizada dentro deste módulo.
async function registerAccount(baseUrl: string, name: string): Promise<Account> {
// Constante ou estado local: `response` mantém o dado necessário ao fluxo abaixo.
    const response = await request(baseUrl, '/api/auth/register', {
        method: 'POST',
        body: {
            nome: name,
            email: `tabletop-test-${randomUUID()}@example.test`,
            password: 'Senha!DeTeste2026',
        },
    });
    assert.equal(response.statusCode, 201);
// Constante ou estado local: `auth` mantém o dado necessário ao fluxo abaixo.
    const auth = apiSuccessSchema(authResponseSchema).parse(response.body).data;
    return {
        userId: auth.user.id,
        cookie: cookiePair(response.headers, 'access_token'),
    };
}

// Bloco local: `createRoom` concentra uma responsabilidade reutilizada dentro deste módulo.
async function createRoom(baseUrl: string, account: Account, name: string): Promise<string> {
// Constante ou estado local: `response` mantém o dado necessário ao fluxo abaixo.
    const response = await request(baseUrl, '/api/rooms', {
        method: 'POST',
        body: { nome: name },
        cookie: account.cookie,
    });
    assert.equal(response.statusCode, 201);
    return apiSuccessSchema(roomSchema).parse(response.body).data.id;
}

// Bloco local: `connect` concentra uma responsabilidade reutilizada dentro deste módulo.
function connect(baseUrl: string, cookie?: string): Promise<Socket> {
// Constante ou estado local: `socket` mantém o dado necessário ao fluxo abaixo.
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

// Bloco local: `waitForEvent` concentra uma responsabilidade reutilizada dentro deste módulo.
function waitForEvent<T>(
    socket: Socket,
    eventName: string,
    predicate: (payload: T) => boolean = () => true,
): Promise<T> {
    return new Promise((resolve, reject) => {
// Constante ou estado local: `timer` mantém o dado necessário ao fluxo abaixo.
        const timer = setTimeout(() => {
            socket.off(eventName, listener);
            reject(new Error(`Timeout aguardando ${eventName}`));
        }, 5_000);
// Constante ou estado local: `listener` mantém o dado necessário ao fluxo abaixo.
        const listener = (payload: T) => {
// Condição: altera o caminho de execução somente quando a regra indicada é verdadeira.
            if (!predicate(payload)) return;
            clearTimeout(timer);
            socket.off(eventName, listener);
            resolve(payload);
        };
        socket.on(eventName, listener);
    });
}

// Bloco local: `emitAck` concentra uma responsabilidade reutilizada dentro deste módulo.
function emitAck(socket: Socket, eventName: string, payload: unknown): Promise<Ack> {
    return new Promise((resolve, reject) => {
// Constante ou estado local: `timer` mantém o dado necessário ao fluxo abaixo.
        const timer = setTimeout(() => reject(new Error(`Timeout aguardando confirmação de ${eventName}`)), 5_000);
        socket.emit(eventName, payload, (response: Ack) => {
            clearTimeout(timer);
            resolve(response);
        });
    });
}

// Bloco local: `expectNoEvent` concentra uma responsabilidade reutilizada dentro deste módulo.
async function expectNoEvent(socket: Socket, eventName: string, durationMs = 150): Promise<void> {
// Constante ou estado local: `observed` mantém o dado necessário ao fluxo abaixo.
    const observed = await Promise.race([
        waitForEvent(socket, eventName).then(() => true),
        new Promise<false>((resolve) => setTimeout(() => resolve(false), durationMs)),
    ]);
    assert.equal(observed, false, `evento inesperado ${eventName}`);
}

// Constante ou estado local: `runId` mantém o dado necessário ao fluxo abaixo.
const runId = randomUUID();
// Constante ou estado local: `roomNamePrefix` mantém o dado necessário ao fluxo abaixo.
const roomNamePrefix = `tabletop-test-${runId}`;
let server: ReturnType<typeof createServer>;
let gateway: ReturnType<typeof createTabletopGateway>;
let baseUrl: string;
// Constante ou estado local: `migrationsReady` mantém o dado necessário ao fluxo abaixo.
let migrationsReady = false;
const sockets: Socket[] = [];

before(async () => {
// Constante ou estado local: `migration` mantém o dado necessário ao fluxo abaixo.
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
// Constante ou estado local: `address` mantém o dado necessário ao fluxo abaixo.
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => {
// Iteração: processa repetidamente os elementos ou tentativas deste bloco.
    for (const socket of sockets) socket.disconnect();
// Condição: altera o caminho de execução somente quando a regra indicada é verdadeira.
    if (gateway) await new Promise<void>((resolve) => gateway.close(() => resolve()));
// Condição: altera o caminho de execução somente quando a regra indicada é verdadeira.
    if (!migrationsReady) return;
// Consulta SQL: acessa ou altera registros no banco conforme parâmetros e condições desta instrução.
    await pool.query('DELETE FROM rooms WHERE nome LIKE ?', [`${roomNamePrefix}%`]);
// Consulta SQL: acessa ou altera registros no banco conforme parâmetros e condições desta instrução.
    await pool.query('DELETE FROM assets WHERE nome LIKE ?', [`${roomNamePrefix}%`]);
// Consulta SQL: acessa ou altera registros no banco conforme parâmetros e condições desta instrução.
    await pool.query("DELETE FROM users WHERE email LIKE 'tabletop-test-%@example.test'");
    await closeDatabase();
});

// Grupo de testes: reúne cenários que exercitam uma mesma área do comportamento.
describe('Socket.IO tabletop autenticado', () => {
// Caso de teste: valida um comportamento específico e suas expectativas.
    it('valida sessão e participação, isola salas, autoriza o mestre e sincroniza estado, tokens e presença', async () => {
// Constante ou estado local: `rejected` mantém o dado necessário ao fluxo abaixo.
        const rejected = await new Promise<boolean>((resolve) => {
// Constante ou estado local: `anonymous` mantém o dado necessário ao fluxo abaixo.
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

// Constante ou estado local: `masterA` mantém o dado necessário ao fluxo abaixo.
        const masterA = await registerAccount(baseUrl, 'Mestre A');
// Constante ou estado local: `playerA` mantém o dado necessário ao fluxo abaixo.
        const playerA = await registerAccount(baseUrl, 'Jogador A');
// Constante ou estado local: `masterB` mantém o dado necessário ao fluxo abaixo.
        const masterB = await registerAccount(baseUrl, 'Mestre B');
// Constante ou estado local: `outsider` mantém o dado necessário ao fluxo abaixo.
        const outsider = await registerAccount(baseUrl, 'Visitante');
// Constante ou estado local: `roomA` mantém o dado necessário ao fluxo abaixo.
        const roomA = await createRoom(baseUrl, masterA, `${roomNamePrefix}-a`);
// Constante ou estado local: `roomB` mantém o dado necessário ao fluxo abaixo.
        const roomB = await createRoom(baseUrl, masterB, `${roomNamePrefix}-b`);

// Constante ou estado local: `joinedPlayer` mantém o dado necessário ao fluxo abaixo.
        const joinedPlayer = await request(baseUrl, '/api/rooms/join', {
            method: 'POST',
            body: {
                codigoConvite: (await request(baseUrl, `/api/rooms/${roomA}`, { cookie: masterA.cookie }))
                    .body.data.sala.codigoConvite as string,
            },
            cookie: playerA.cookie,
        });
        assert.equal(joinedPlayer.statusCode, 201);

// Constante ou estado local: `socketA` mantém o dado necessário ao fluxo abaixo.
        const socketA = await connect(baseUrl, masterA.cookie);
// Constante ou estado local: `playerSocket` mantém o dado necessário ao fluxo abaixo.
        const playerSocket = await connect(baseUrl, playerA.cookie);
// Constante ou estado local: `socketB` mantém o dado necessário ao fluxo abaixo.
        const socketB = await connect(baseUrl, masterB.cookie);
// Constante ou estado local: `outsiderSocket` mantém o dado necessário ao fluxo abaixo.
        const outsiderSocket = await connect(baseUrl, outsider.cookie);
        sockets.push(socketA, playerSocket, socketB, outsiderSocket);

// Constante ou estado local: `stateAEvent` mantém o dado necessário ao fluxo abaixo.
        const stateAEvent = waitForEvent<{ v: number; roomId: string; board: unknown; scene: {
            id: string;
            backgroundUrl?: string | null;
            gridConfig: { enabled: boolean; size: number };
        }; tokens: unknown[] }>(socketA, 'tabletop:v1:state');
// Constante ou estado local: `joinA` mantém o dado necessário ao fluxo abaixo.
        const joinA = await emitAck(socketA, 'tabletop:v1:join', { v: 1, roomId: roomA });
        assert.equal(joinA.ok, true);
// Constante ou estado local: `stateA` mantém o dado necessário ao fluxo abaixo.
        const stateA = await stateAEvent;
        assert.equal(stateA.v, 1);
        assert.equal(stateA.roomId, roomA);
        assert.ok(stateA.board);
        assert.equal(stateA.scene.gridConfig.enabled, true);
        assert.ok(stateA.scene.gridConfig.size > 0);
        assert.deepEqual(stateA.tokens, []);

// Constante ou estado local: `statePlayerEvent` mantém o dado necessário ao fluxo abaixo.
        const statePlayerEvent = waitForEvent<{ roomId: string }>(playerSocket, 'tabletop:v1:state');
        assert.equal(
            (await emitAck(playerSocket, 'tabletop:v1:join', { v: 1, roomId: roomA })).ok,
            true,
        );
        assert.equal((await statePlayerEvent).roomId, roomA);

// Constante ou estado local: `stateBEvent` mantém o dado necessário ao fluxo abaixo.
        const stateBEvent = waitForEvent<{ roomId: string }>(socketB, 'tabletop:v1:state');
        assert.equal((await emitAck(socketB, 'tabletop:v1:join', { v: 1, roomId: roomB })).ok, true);
        assert.equal((await stateBEvent).roomId, roomB);

// Constante ou estado local: `outsiderJoin` mantém o dado necessário ao fluxo abaixo.
        const outsiderJoin = await emitAck(outsiderSocket, 'tabletop:v1:join', { v: 1, roomId: roomA });
        assert.equal(outsiderJoin.ok, false);
        assert.equal(outsiderJoin.error?.code, 'ROOM_ACCESS_DENIED');

// Constante ou estado local: `assetId` mantém o dado necessário ao fluxo abaixo.
        const assetId = randomUUID();
// Consulta SQL: acessa ou altera registros no banco conforme parâmetros e condições desta instrução.
        await pool.query(
            `INSERT INTO assets (id, sala_id, nome, tipo, url, visibilidade)
             VALUES (?, ?, ?, 'TOKEN', ?, 'SALA')`,
            [assetId, roomA, `${roomNamePrefix}-asset`, 'https://example.test/token.png'],
        );

// Constante ou estado local: `playerAdd` mantém o dado necessário ao fluxo abaixo.
        const playerAdd = await emitAck(playerSocket, 'tabletop:v1:token:add', {
            v: 1,
            token: { nome: 'Jogador não autorizado', x: 1, y: 2, escala: 1 },
        });
        assert.equal(playerAdd.ok, false);
        assert.equal(playerAdd.error?.code, 'MASTER_REQUIRED');

// Constante ou estado local: `invalidPayload` mantém o dado necessário ao fluxo abaixo.
        const invalidPayload = await emitAck(socketA, 'tabletop:v1:token:add', {
            v: 1,
            token: { nome: '', x: 'fora-do-grid', y: 2, escala: 0 },
        });
        assert.equal(invalidPayload.ok, false);
        assert.equal(invalidPayload.error?.code, 'INVALID_PAYLOAD');

// Constante ou estado local: `roomBReceivedToken` mantém o dado necessário ao fluxo abaixo.
        let roomBReceivedToken = false;
// Constante ou estado local: `roomBTokenListener` mantém o dado necessário ao fluxo abaixo.
        const roomBTokenListener = () => { roomBReceivedToken = true; };
        socketB.on('tabletop:v1:token:added', roomBTokenListener);
// Constante ou estado local: `tokenAddedEvent` mantém o dado necessário ao fluxo abaixo.
        const tokenAddedEvent = waitForEvent<{ token: { id: string; assetOrigemId?: string | null } }>(
            playerSocket,
            'tabletop:v1:token:added',
        );
// Constante ou estado local: `added` mantém o dado necessário ao fluxo abaixo.
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

// Constante ou estado local: `playerMove` mantém o dado necessário ao fluxo abaixo.
        const playerMove = await emitAck(playerSocket, 'tabletop:v1:token:move', {
            v: 1,
            tokenId: added.token!.id,
            x: 128,
            y: 160,
        });
        assert.equal(playerMove.ok, false);
        assert.equal(playerMove.error?.code, 'MASTER_REQUIRED');

// Constante ou estado local: `movedEvent` mantém o dado necessário ao fluxo abaixo.
        const movedEvent = waitForEvent<{ token: { id: string; x: number; y: number } }>(
            playerSocket,
            'tabletop:v1:token:moved',
        );
// Constante ou estado local: `moved` mantém o dado necessário ao fluxo abaixo.
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

// Constante ou estado local: `initialAfterMove` mantém o dado necessário ao fluxo abaixo.
        const initialAfterMove = await tabletopService.getInitialState(roomA, masterA.userId);
        assert.equal(initialAfterMove.tokens[0]?.id, added.token!.id);
        assert.equal(initialAfterMove.tokens[0]?.x, 128);

// Constante ou estado local: `presenceAfterSecondSocket` mantém o dado necessário ao fluxo abaixo.
        const presenceAfterSecondSocket = waitForEvent<{ onlineUserIds: string[] }>(
            socketA,
            'tabletop:v1:presence',
            (presence) => presence.onlineUserIds.includes(masterA.userId),
        );
// Constante ou estado local: `duplicateMasterSocket` mantém o dado necessário ao fluxo abaixo.
        const duplicateMasterSocket = await connect(baseUrl, masterA.cookie);
        sockets.push(duplicateMasterSocket);
// Constante ou estado local: `duplicateStateEvent` mantém o dado necessário ao fluxo abaixo.
        const duplicateStateEvent = waitForEvent(duplicateMasterSocket, 'tabletop:v1:state');
        assert.equal((await emitAck(duplicateMasterSocket, 'tabletop:v1:join', { v: 1, roomId: roomA })).ok, true);
        await duplicateStateEvent;
// Constante ou estado local: `duplicatePresence` mantém o dado necessário ao fluxo abaixo.
        const duplicatePresence = await presenceAfterSecondSocket;
        assert.equal(duplicatePresence.onlineUserIds.filter((userId) => userId === masterA.userId).length, 1);

// Constante ou estado local: `masterWentOffline` mantém o dado necessário ao fluxo abaixo.
        let masterWentOffline = false;
// Constante ou estado local: `offlineListener` mantém o dado necessário ao fluxo abaixo.
        const offlineListener = (presence: { onlineUserIds: string[] }) => {
// Condição: altera o caminho de execução somente quando a regra indicada é verdadeira.
            if (!presence.onlineUserIds.includes(masterA.userId)) masterWentOffline = true;
        };
        playerSocket.on('tabletop:v1:presence', offlineListener);
        duplicateMasterSocket.disconnect();
        await new Promise((resolve) => setTimeout(resolve, 150));
        assert.equal(masterWentOffline, false, 'uma conexão restante mantém o usuário online');

// Constante ou estado local: `presenceAfterMasterDisconnect` mantém o dado necessário ao fluxo abaixo.
        const presenceAfterMasterDisconnect = waitForEvent<{ onlineUserIds: string[] }>(
            playerSocket,
            'tabletop:v1:presence',
            (presence) => !presence.onlineUserIds.includes(masterA.userId),
        );
        socketA.disconnect();
        assert.ok(!(await presenceAfterMasterDisconnect).onlineUserIds.includes(masterA.userId));
        playerSocket.off('tabletop:v1:presence', offlineListener);

// Constante ou estado local: `removedEvent` mantém o dado necessário ao fluxo abaixo.
        const removedEvent = waitForEvent<{ tokenId: string }>(playerSocket, 'tabletop:v1:token:removed');
// Constante ou estado local: `removed` mantém o dado necessário ao fluxo abaixo.
        const removed = await emitAck(playerSocket, 'tabletop:v1:token:remove', {
            v: 1,
            tokenId: added.token!.id,
        });
        assert.equal(removed.ok, false);
        assert.equal(removed.error?.code, 'MASTER_REQUIRED');

// Constante ou estado local: `lastMasterSocket` mantém o dado necessário ao fluxo abaixo.
        const lastMasterSocket = await connect(baseUrl, masterA.cookie);
        sockets.push(lastMasterSocket);
// Constante ou estado local: `finalStateEvent` mantém o dado necessário ao fluxo abaixo.
        const finalStateEvent = waitForEvent(lastMasterSocket, 'tabletop:v1:state');
// Constante ou estado local: `removeAck` mantém o dado necessário ao fluxo abaixo.
        const removeAck = await emitAck(lastMasterSocket, 'tabletop:v1:join', { v: 1, roomId: roomA });
        assert.equal(removeAck.ok, true);
        await finalStateEvent;
// Constante ou estado local: `removedToken` mantém o dado necessário ao fluxo abaixo.
        const removedToken = await emitAck(lastMasterSocket, 'tabletop:v1:token:remove', {
            v: 1,
            tokenId: added.token!.id,
        });
        assert.equal(removedToken.ok, true);
        assert.equal((await removedEvent).tokenId, added.token!.id);
// Constante ou estado local: `finalState` mantém o dado necessário ao fluxo abaixo.
        const finalState = await tabletopService.getInitialState(roomA, masterA.userId);
        assert.deepEqual(finalState.tokens, []);

// Consulta SQL: acessa ou altera registros no banco conforme parâmetros e condições desta instrução.
        const [assets] = await pool.query<Array<{ id: string }>>('SELECT id FROM assets WHERE id = ?', [assetId]);
        assert.equal(assets.length, 1, 'remover token não deve apagar o asset de origem');
    });

// Caso de teste: valida um comportamento específico e suas expectativas.
    it('entrega e persiste chat e rolagens apenas para participantes, calculando dados no servidor', async () => {
// Constante ou estado local: `master` mantém o dado necessário ao fluxo abaixo.
        const master = await registerAccount(baseUrl, 'Mestre do chat');
// Constante ou estado local: `player` mantém o dado necessário ao fluxo abaixo.
        const player = await registerAccount(baseUrl, 'Jogador do chat');
// Constante ou estado local: `otherMaster` mantém o dado necessário ao fluxo abaixo.
        const otherMaster = await registerAccount(baseUrl, 'Mestre de outra sala');
// Constante ou estado local: `outsider` mantém o dado necessário ao fluxo abaixo.
        const outsider = await registerAccount(baseUrl, 'Visitante do chat');
// Constante ou estado local: `roomA` mantém o dado necessário ao fluxo abaixo.
        const roomA = await createRoom(baseUrl, master, `${roomNamePrefix}-chat-a`);
// Constante ou estado local: `roomB` mantém o dado necessário ao fluxo abaixo.
        const roomB = await createRoom(baseUrl, otherMaster, `${roomNamePrefix}-chat-b`);
// Constante ou estado local: `roomDetails` mantém o dado necessário ao fluxo abaixo.
        const roomDetails = await request(baseUrl, `/api/rooms/${roomA}`, { cookie: master.cookie });
// Constante ou estado local: `joinPlayer` mantém o dado necessário ao fluxo abaixo.
        const joinPlayer = await request(baseUrl, '/api/rooms/join', {
            method: 'POST',
            body: { codigoConvite: roomDetails.body.data.sala.codigoConvite as string },
            cookie: player.cookie,
        });
        assert.equal(joinPlayer.statusCode, 201);

// Constante ou estado local: `masterSocket` mantém o dado necessário ao fluxo abaixo.
        const masterSocket = await connect(baseUrl, master.cookie);
// Constante ou estado local: `playerSocket` mantém o dado necessário ao fluxo abaixo.
        const playerSocket = await connect(baseUrl, player.cookie);
// Constante ou estado local: `otherRoomSocket` mantém o dado necessário ao fluxo abaixo.
        const otherRoomSocket = await connect(baseUrl, otherMaster.cookie);
// Constante ou estado local: `outsiderSocket` mantém o dado necessário ao fluxo abaixo.
        const outsiderSocket = await connect(baseUrl, outsider.cookie);
        sockets.push(masterSocket, playerSocket, otherRoomSocket, outsiderSocket);

// Constante ou estado local: `joins` mantém o dado necessário ao fluxo abaixo.
        const joins = [
            [masterSocket, roomA],
            [playerSocket, roomA],
            [otherRoomSocket, roomB],
        ] as const;
// Iteração: processa repetidamente os elementos ou tentativas deste bloco.
        for (const [socket, roomId] of joins) {
// Constante ou estado local: `stateEvent` mantém o dado necessário ao fluxo abaixo.
            const stateEvent = waitForEvent<{ roomId: string }>(socket, 'tabletop:v1:state');
            assert.equal((await emitAck(socket, 'tabletop:v1:join', { v: 1, roomId })).ok, true);
            assert.equal((await stateEvent).roomId, roomId);
        }

// Constante ou estado local: `outsiderJoin` mantém o dado necessário ao fluxo abaixo.
        const outsiderJoin = await emitAck(outsiderSocket, 'tabletop:v1:join', { v: 1, roomId: roomA });
        assert.equal(outsiderJoin.ok, false);
        assert.equal(outsiderJoin.error?.code, 'ROOM_ACCESS_DENIED');
// Constante ou estado local: `notJoined` mantém o dado necessário ao fluxo abaixo.
        const notJoined = await emitAck(outsiderSocket, 'tabletop:v1:message:send', {
            v: 1,
            content: 'Sem sala',
        });
        assert.equal(notJoined.ok, false);
        assert.equal(notJoined.error?.code, 'ROOM_NOT_JOINED');

        const roomBMessages: Array<{ message: { conteudo: string } }> = [];
// Constante ou estado local: `roomBListener` mantém o dado necessário ao fluxo abaixo.
        const roomBListener = (event: { message: { conteudo: string } }) => roomBMessages.push(event);
        otherRoomSocket.on('tabletop:v1:message:created', roomBListener);

// Constante ou estado local: `chatFromPlayer` mantém o dado necessário ao fluxo abaixo.
        const chatFromPlayer = waitForEvent<{ v: number; message: { tipo: string; conteudo: string; autorId: string } }>(
            masterSocket,
            'tabletop:v1:message:created',
            (event) => event.message.conteudo === 'Olá, sala!',
        );
// Constante ou estado local: `chatToSender` mantém o dado necessário ao fluxo abaixo.
        const chatToSender = waitForEvent<{ message: { id: string } }>(
            playerSocket,
            'tabletop:v1:message:created',
            (event) => event.message.conteudo === 'Olá, sala!',
        );
// Constante ou estado local: `chatAck` mantém o dado necessário ao fluxo abaixo.
        const chatAck = await emitAck(playerSocket, 'tabletop:v1:message:send', {
            v: 1,
            content: 'Olá, sala!',
        });
        assert.equal(chatAck.ok, true);
// Constante ou estado local: `chat` mantém o dado necessário ao fluxo abaixo.
        const chat = await chatFromPlayer;
        assert.equal(chat.message.tipo, 'CHAT');
        assert.equal(chat.message.autorId, player.userId);
        assert.equal((await chatToSender).message.id, chat.message.id);

// Constante ou estado local: `invalidClientResult` mantém o dado necessário ao fluxo abaixo.
        const invalidClientResult = await emitAck(playerSocket, 'tabletop:v1:message:send', {
            v: 1,
            content: '2d4+2',
            result: 999,
        });
        assert.equal(invalidClientResult.ok, false);
        assert.equal(invalidClientResult.error?.code, 'INVALID_PAYLOAD');

// Constante ou estado local: `oversizedMessage` mantém o dado necessário ao fluxo abaixo.
        const oversizedMessage = await emitAck(playerSocket, 'tabletop:v1:message:send', {
            v: 1,
            content: 'x'.repeat(1001),
        });
        assert.equal(oversizedMessage.ok, false);
        assert.equal(oversizedMessage.error?.code, 'INVALID_PAYLOAD');

// Constante ou estado local: `invalidExpression` mantém o dado necessário ao fluxo abaixo.
        const invalidExpression = await emitAck(playerSocket, 'tabletop:v1:message:send', {
            v: 1,
            content: '101d6',
        });
        assert.equal(invalidExpression.ok, false);
        assert.equal(invalidExpression.error?.code, 'INVALID_DICE_EXPRESSION');

// Constante ou estado local: `rollFromPlayer` mantém o dado necessário ao fluxo abaixo.
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
// Constante ou estado local: `rollToSender` mantém o dado necessário ao fluxo abaixo.
        const rollToSender = waitForEvent<{ message: { conteudo: string } }>(
            playerSocket,
            'tabletop:v1:message:created',
            (event) => event.message.conteudo === '3#5d20',
        );
// Constante ou estado local: `rollAck` mantém o dado necessário ao fluxo abaixo.
        const rollAck = await emitAck(playerSocket, 'tabletop:v1:message:send', {
            v: 1,
            content: '3#5d20',
        });
        assert.equal(rollAck.ok, true);
// Constante ou estado local: `roll` mantém o dado necessário ao fluxo abaixo.
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

// Consulta SQL: acessa ou altera registros no banco conforme parâmetros e condições desta instrução.
        const [persisted] = await pool.query<Array<{ tipo: string; metadata: unknown }>>(
            'SELECT tipo, metadata FROM message_logs WHERE sala_id = ? ORDER BY created_at ASC',
            [roomA],
        );
        assert.deepEqual(persisted.map((message) => message.tipo), ['CHAT', 'ROLAGEM']);
        assert.ok(persisted[1]?.metadata);

// Constante ou estado local: `duplicateSocket` mantém o dado necessário ao fluxo abaixo.
        const duplicateSocket = await connect(baseUrl, master.cookie);
        sockets.push(duplicateSocket);
// Constante ou estado local: `historyEvent` mantém o dado necessário ao fluxo abaixo.
        const historyEvent = waitForEvent<{
            roomId: string;
            messages: Array<{ conteudo: string }>;
        }>(duplicateSocket, 'tabletop:v1:messages');
// Constante ou estado local: `duplicateState` mantém o dado necessário ao fluxo abaixo.
        const duplicateState = waitForEvent(duplicateSocket, 'tabletop:v1:state');
        assert.equal((await emitAck(duplicateSocket, 'tabletop:v1:join', { v: 1, roomId: roomA })).ok, true);
        await duplicateState;
        assert.equal((await historyEvent).messages.length, 2);
    });
});
