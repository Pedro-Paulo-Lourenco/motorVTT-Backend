/** Valida o isolamento e a persistência das salas contra MySQL real. */
// Importações: reúnem bibliotecas, tipos e módulos locais usados pelos blocos seguintes.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { request as httpRequest, type IncomingHttpHeaders } from 'node:http';
import { after, before, describe, it } from 'node:test';

import {
    apiErrorResponseSchema,
    apiSuccessSchema,
    authResponseSchema,
    participantSchema,
    roomSchema,
} from '@motor-vtt/contracts';
import type { Express } from 'express';
import { z } from 'zod';

import app from '../src/app.js';
import { closeDatabase, pool } from '../src/config/database.js';

// Tipo: `HttpResult` descreve o formato estruturado usado nas operações relacionadas.
type HttpResult = {
    statusCode: number;
    headers: IncomingHttpHeaders;
    body: unknown;
};

// Constante ou estado local: `roomDetailsSchema` mantém o dado necessário ao fluxo abaixo.
const roomDetailsSchema = z.object({
    sala: roomSchema,
    participantes: participantSchema.array(),
});

let server: ReturnType<Express['listen']>;
let baseUrl: string;
// Constante ou estado local: `migrationsReady` mantém o dado necessário ao fluxo abaixo.
let migrationsReady = false;
// Constante ou estado local: `testRunId` mantém o dado necessário ao fluxo abaixo.
const testRunId = randomUUID();
// Constante ou estado local: `roomNamePrefix` mantém o dado necessário ao fluxo abaixo.
const roomNamePrefix = `room-flow-test-${testRunId}`;

before(async () => {
// Constante ou estado local: `migration` mantém o dado necessário ao fluxo abaixo.
    const migration = spawnSync(process.execPath, ['--import', 'tsx', 'src/database/cli.ts', 'up'], {
        cwd: process.cwd(),
        encoding: 'utf8',
        env: process.env,
    });
    assert.equal(migration.status, 0, `${migration.stdout}\n${migration.stderr}`);
    migrationsReady = true;

    server = app.listen(0, '127.0.0.1');
    await once(server, 'listening');
// Constante ou estado local: `address` mantém o dado necessário ao fluxo abaixo.
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => {
// Condição: altera o caminho de execução somente quando a regra indicada é verdadeira.
    if (!migrationsReady) return;
// Condição: altera o caminho de execução somente quando a regra indicada é verdadeira.
    if (server?.listening) {
        server.close();
        await once(server, 'close');
    }
// Consulta SQL: acessa ou altera registros no banco conforme parâmetros e condições desta instrução.
    await pool.query('DELETE FROM rooms WHERE nome LIKE ?', [`${roomNamePrefix}%`]);
// Consulta SQL: acessa ou altera registros no banco conforme parâmetros e condições desta instrução.
    await pool.query("DELETE FROM users WHERE email LIKE 'rooms-test-%@example.test'");
    await closeDatabase();
});

// Bloco local: `request` concentra uma responsabilidade reutilizada dentro deste módulo.
async function request(
    path: string,
    options: {
        method?: string;
        body?: Record<string, unknown>;
        cookie?: string;
    } = {},
): Promise<HttpResult> {
// Constante ou estado local: `url` mantém o dado necessário ao fluxo abaixo.
    const url = new URL(path, baseUrl);
    return new Promise((resolve, reject) => {
// Constante ou estado local: `outgoing` mantém o dado necessário ao fluxo abaixo.
        const outgoing = httpRequest(url, {
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
                        body: JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown,
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
// Constante ou estado local: `cookies` mantém o dado necessário ao fluxo abaixo.
    const cookies = headers['set-cookie'] ?? [];
// Constante ou estado local: `found` mantém o dado necessário ao fluxo abaixo.
    const found = cookies.find((cookie) => cookie.startsWith(`${name}=`));
    assert.ok(found, `cookie ${name} ausente`);
    return found.split(';', 1)[0] as string;
}

// Bloco local: `registerAccount` concentra uma responsabilidade reutilizada dentro deste módulo.
async function registerAccount(name: string): Promise<{ userId: string; cookie: string }> {
// Constante ou estado local: `response` mantém o dado necessário ao fluxo abaixo.
    const response = await request('/api/auth/register', {
        method: 'POST',
        body: {
            nome: name,
            email: `rooms-test-${randomUUID()}@example.test`,
            password: 'Senha!DeTeste2026',
        },
    });
    assert.equal(response.statusCode, 201);
// Constante ou estado local: `success` mantém o dado necessário ao fluxo abaixo.
    const success = apiSuccessSchema(authResponseSchema).parse(response.body);
    return {
        userId: success.data.user.id,
        cookie: cookiePair(response.headers, 'access_token'),
    };
}

// Bloco local: `errorCode` concentra uma responsabilidade reutilizada dentro deste módulo.
function errorCode(response: HttpResult): string {
    return apiErrorResponseSchema.parse(response.body).error.code;
}

// Grupo de testes: reúne cenários que exercitam uma mesma área do comportamento.
describe('fluxo HTTP integrado de salas', () => {
// Caso de teste: valida um comportamento específico e suas expectativas.
    it('cria, lista, convida e protege o lobby usando sessões de contas distintas', async () => {
// Constante ou estado local: `mestre` mantém o dado necessário ao fluxo abaixo.
        const mestre = await registerAccount('Mestre de teste');
// Constante ou estado local: `jogador` mantém o dado necessário ao fluxo abaixo.
        const jogador = await registerAccount('Jogador de teste');
// Constante ou estado local: `externo` mantém o dado necessário ao fluxo abaixo.
        const externo = await registerAccount('Visitante de teste');
// Constante ou estado local: `roomName` mantém o dado necessário ao fluxo abaixo.
        const roomName = `${roomNamePrefix}-ativa`;

// Constante ou estado local: `unauthenticated` mantém o dado necessário ao fluxo abaixo.
        const unauthenticated = await Promise.all([
            request('/api/rooms', { method: 'POST', body: { nome: roomName } }),
            request('/api/rooms'),
            request('/api/rooms/join', { method: 'POST', body: { codigoConvite: 'ABC123' } }),
            request(`/api/rooms/${randomUUID()}`),
        ]);
// Iteração: processa repetidamente os elementos ou tentativas deste bloco.
        for (const response of unauthenticated) {
            assert.equal(response.statusCode, 401);
            assert.equal(errorCode(response), 'UNAUTHORIZED');
        }

// Constante ou estado local: `created` mantém o dado necessário ao fluxo abaixo.
        const created = await request('/api/rooms', {
            method: 'POST',
            body: { nome: roomName },
            cookie: mestre.cookie,
        });
        assert.equal(created.statusCode, 201);
// Constante ou estado local: `room` mantém o dado necessário ao fluxo abaixo.
        const room = apiSuccessSchema(roomSchema).parse(created.body).data;

// Constante ou estado local: `mestreRooms` mantém o dado necessário ao fluxo abaixo.
        const mestreRooms = await request('/api/rooms', { cookie: mestre.cookie });
        assert.equal(mestreRooms.statusCode, 200);
// Constante ou estado local: `ownRooms` mantém o dado necessário ao fluxo abaixo.
        const ownRooms = apiSuccessSchema(roomSchema.array()).parse(mestreRooms.body).data;
        assert.ok(ownRooms.some((entry) => entry.id === room.id));

// Constante ou estado local: `mestreLobbyResponse` mantém o dado necessário ao fluxo abaixo.
        const mestreLobbyResponse = await request(`/api/rooms/${room.id}`, { cookie: mestre.cookie });
        assert.equal(mestreLobbyResponse.statusCode, 200);
// Constante ou estado local: `mestreLobby` mantém o dado necessário ao fluxo abaixo.
        const mestreLobby = apiSuccessSchema(roomDetailsSchema).parse(mestreLobbyResponse.body).data;
        assert.equal(mestreLobby.sala.id, room.id);
// Constante ou estado local: `mestreParticipant` mantém o dado necessário ao fluxo abaixo.
        const mestreParticipant = mestreLobby.participantes.find(
            (participant) => participant.usuarioId === mestre.userId,
        );
        assert.equal(mestreParticipant?.papel, 'MESTRE');

// Constante ou estado local: `invalidCode` mantém o dado necessário ao fluxo abaixo.
        const invalidCode = await request('/api/rooms/join', {
            method: 'POST',
            body: { codigoConvite: 'CODIGO-NAO-EXISTE' },
            cookie: jogador.cookie,
        });
        assert.equal(invalidCode.statusCode, 404);
        assert.equal(errorCode(invalidCode), 'ROOM_NOT_FOUND');

// Constante ou estado local: `joined` mantém o dado necessário ao fluxo abaixo.
        const joined = await request('/api/rooms/join', {
            method: 'POST',
            body: { codigoConvite: room.codigoConvite },
            cookie: jogador.cookie,
        });
        assert.equal(joined.statusCode, 201);
// Constante ou estado local: `participant` mantém o dado necessário ao fluxo abaixo.
        const participant = apiSuccessSchema(participantSchema).parse(joined.body).data;
        assert.equal(participant.salaId, room.id);
        assert.equal(participant.usuarioId, jogador.userId);
        assert.equal(participant.papel, 'JOGADOR');

// Constante ou estado local: `playerRoomsResponse` mantém o dado necessário ao fluxo abaixo.
        const playerRoomsResponse = await request('/api/rooms', { cookie: jogador.cookie });
// Constante ou estado local: `playerRooms` mantém o dado necessário ao fluxo abaixo.
        const playerRooms = apiSuccessSchema(roomSchema.array()).parse(playerRoomsResponse.body).data;
        assert.ok(playerRooms.some((entry) => entry.id === room.id));

// Constante ou estado local: `duplicate` mantém o dado necessário ao fluxo abaixo.
        const duplicate = await request('/api/rooms/join', {
            method: 'POST',
            body: { codigoConvite: room.codigoConvite },
            cookie: jogador.cookie,
        });
        assert.equal(duplicate.statusCode, 409);
        assert.equal(errorCode(duplicate), 'ALREADY_PARTICIPANT');

// Constante ou estado local: `playerLobby` mantém o dado necessário ao fluxo abaixo.
        const playerLobby = await request(`/api/rooms/${room.id}`, { cookie: jogador.cookie });
        assert.equal(playerLobby.statusCode, 200);
// Constante ou estado local: `playerLobbyData` mantém o dado necessário ao fluxo abaixo.
        const playerLobbyData = apiSuccessSchema(roomDetailsSchema).parse(playerLobby.body).data;
        assert.equal(
            playerLobbyData.participantes.find((entry) => entry.usuarioId === jogador.userId)?.papel,
            'JOGADOR',
        );
        assert.equal(playerLobbyData.participantes.length, 2);

// Constante ou estado local: `forbiddenLobby` mantém o dado necessário ao fluxo abaixo.
        const forbiddenLobby = await request(`/api/rooms/${room.id}`, { cookie: externo.cookie });
        assert.equal(forbiddenLobby.statusCode, 404);
        assert.equal(errorCode(forbiddenLobby), 'ROOM_NOT_FOUND');

// Constante ou estado local: `closedName` mantém o dado necessário ao fluxo abaixo.
        const closedName = `${roomNamePrefix}-encerrada`;
// Constante ou estado local: `closedResponse` mantém o dado necessário ao fluxo abaixo.
        const closedResponse = await request('/api/rooms', {
            method: 'POST',
            body: { nome: closedName },
            cookie: mestre.cookie,
        });
        assert.equal(closedResponse.statusCode, 201);
// Constante ou estado local: `closedRoom` mantém o dado necessário ao fluxo abaixo.
        const closedRoom = apiSuccessSchema(roomSchema).parse(closedResponse.body).data;
// Consulta SQL: acessa ou altera registros no banco conforme parâmetros e condições desta instrução.
        await pool.query('UPDATE rooms SET status = ? WHERE id = ?', ['ENCERRADA', closedRoom.id]);
// Constante ou estado local: `closedJoin` mantém o dado necessário ao fluxo abaixo.
        const closedJoin = await request('/api/rooms/join', {
            method: 'POST',
            body: { codigoConvite: closedRoom.codigoConvite },
            cookie: jogador.cookie,
        });
        assert.equal(closedJoin.statusCode, 409);
        assert.equal(errorCode(closedJoin), 'ROOM_INACTIVE');
    });

// Caso de teste: valida um comportamento específico e suas expectativas.
    it('retorna erros no envelope compartilhado e rejeita entradas inválidas', async () => {
// Constante ou estado local: `user` mantém o dado necessário ao fluxo abaixo.
        const user = await registerAccount('Validador de teste');
// Constante ou estado local: `malformedName` mantém o dado necessário ao fluxo abaixo.
        const malformedName = await request('/api/rooms', {
            method: 'POST',
            body: { nome: '', userId: user.userId },
            cookie: user.cookie,
        });
        assert.equal(malformedName.statusCode, 422);
        assert.equal(errorCode(malformedName), 'VALIDATION_ERROR');
    });
});
