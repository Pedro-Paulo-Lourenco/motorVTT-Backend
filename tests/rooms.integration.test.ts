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

type HttpResult = {
    statusCode: number;
    headers: IncomingHttpHeaders;
    body: unknown;
};

const roomDetailsSchema = z.object({
    sala: roomSchema,
    participantes: participantSchema.array(),
});

let server: ReturnType<Express['listen']>;
let baseUrl: string;
let migrationsReady = false;
const testRunId = randomUUID();
const roomNamePrefix = `room-flow-test-${testRunId}`;

before(async () => {
    const migration = spawnSync(process.execPath, ['--import', 'tsx', 'src/database/cli.ts', 'up'], {
        cwd: process.cwd(),
        encoding: 'utf8',
        env: process.env,
    });
    assert.equal(migration.status, 0, `${migration.stdout}\n${migration.stderr}`);
    migrationsReady = true;

    server = app.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => {
    if (!migrationsReady) return;
    if (server?.listening) {
        server.close();
        await once(server, 'close');
    }
    await pool.query('DELETE FROM rooms WHERE nome LIKE ?', [`${roomNamePrefix}%`]);
    await pool.query("DELETE FROM users WHERE email LIKE 'rooms-test-%@example.test'");
    await closeDatabase();
});

async function request(
    path: string,
    options: {
        method?: string;
        body?: Record<string, unknown>;
        cookie?: string;
    } = {},
): Promise<HttpResult> {
    const url = new URL(path, baseUrl);
    return new Promise((resolve, reject) => {
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
        if (options.body !== undefined) outgoing.write(JSON.stringify(options.body));
        outgoing.end();
    });
}

function cookiePair(headers: IncomingHttpHeaders, name: string): string {
    const cookies = headers['set-cookie'] ?? [];
    const found = cookies.find((cookie) => cookie.startsWith(`${name}=`));
    assert.ok(found, `cookie ${name} ausente`);
    return found.split(';', 1)[0] as string;
}

async function registerAccount(name: string): Promise<{ userId: string; cookie: string }> {
    const response = await request('/api/auth/register', {
        method: 'POST',
        body: {
            nome: name,
            email: `rooms-test-${randomUUID()}@example.test`,
            password: 'Senha!DeTeste2026',
        },
    });
    assert.equal(response.statusCode, 201);
    const success = apiSuccessSchema(authResponseSchema).parse(response.body);
    return {
        userId: success.data.user.id,
        cookie: cookiePair(response.headers, 'access_token'),
    };
}

function errorCode(response: HttpResult): string {
    return apiErrorResponseSchema.parse(response.body).error.code;
}

describe('fluxo HTTP integrado de salas', () => {
    it('cria, lista, convida e protege o lobby usando sessões de contas distintas', async () => {
        const mestre = await registerAccount('Mestre de teste');
        const jogador = await registerAccount('Jogador de teste');
        const externo = await registerAccount('Visitante de teste');
        const roomName = `${roomNamePrefix}-ativa`;

        const unauthenticated = await Promise.all([
            request('/api/rooms', { method: 'POST', body: { nome: roomName } }),
            request('/api/rooms'),
            request('/api/rooms/join', { method: 'POST', body: { codigoConvite: 'ABC123' } }),
            request(`/api/rooms/${randomUUID()}`),
        ]);
        for (const response of unauthenticated) {
            assert.equal(response.statusCode, 401);
            assert.equal(errorCode(response), 'UNAUTHORIZED');
        }

        const created = await request('/api/rooms', {
            method: 'POST',
            body: { nome: roomName },
            cookie: mestre.cookie,
        });
        assert.equal(created.statusCode, 201);
        const room = apiSuccessSchema(roomSchema).parse(created.body).data;

        const mestreRooms = await request('/api/rooms', { cookie: mestre.cookie });
        assert.equal(mestreRooms.statusCode, 200);
        const ownRooms = apiSuccessSchema(roomSchema.array()).parse(mestreRooms.body).data;
        assert.ok(ownRooms.some((entry) => entry.id === room.id));

        const mestreLobbyResponse = await request(`/api/rooms/${room.id}`, { cookie: mestre.cookie });
        assert.equal(mestreLobbyResponse.statusCode, 200);
        const mestreLobby = apiSuccessSchema(roomDetailsSchema).parse(mestreLobbyResponse.body).data;
        assert.equal(mestreLobby.sala.id, room.id);
        const mestreParticipant = mestreLobby.participantes.find(
            (participant) => participant.usuarioId === mestre.userId,
        );
        assert.equal(mestreParticipant?.papel, 'MESTRE');

        const invalidCode = await request('/api/rooms/join', {
            method: 'POST',
            body: { codigoConvite: 'CODIGO-NAO-EXISTE' },
            cookie: jogador.cookie,
        });
        assert.equal(invalidCode.statusCode, 404);
        assert.equal(errorCode(invalidCode), 'ROOM_NOT_FOUND');

        const joined = await request('/api/rooms/join', {
            method: 'POST',
            body: { codigoConvite: room.codigoConvite },
            cookie: jogador.cookie,
        });
        assert.equal(joined.statusCode, 201);
        const participant = apiSuccessSchema(participantSchema).parse(joined.body).data;
        assert.equal(participant.salaId, room.id);
        assert.equal(participant.usuarioId, jogador.userId);
        assert.equal(participant.papel, 'JOGADOR');

        const playerRoomsResponse = await request('/api/rooms', { cookie: jogador.cookie });
        const playerRooms = apiSuccessSchema(roomSchema.array()).parse(playerRoomsResponse.body).data;
        assert.ok(playerRooms.some((entry) => entry.id === room.id));

        const duplicate = await request('/api/rooms/join', {
            method: 'POST',
            body: { codigoConvite: room.codigoConvite },
            cookie: jogador.cookie,
        });
        assert.equal(duplicate.statusCode, 409);
        assert.equal(errorCode(duplicate), 'ALREADY_PARTICIPANT');

        const playerLobby = await request(`/api/rooms/${room.id}`, { cookie: jogador.cookie });
        assert.equal(playerLobby.statusCode, 200);
        const playerLobbyData = apiSuccessSchema(roomDetailsSchema).parse(playerLobby.body).data;
        assert.equal(
            playerLobbyData.participantes.find((entry) => entry.usuarioId === jogador.userId)?.papel,
            'JOGADOR',
        );
        assert.equal(playerLobbyData.participantes.length, 2);

        const forbiddenLobby = await request(`/api/rooms/${room.id}`, { cookie: externo.cookie });
        assert.equal(forbiddenLobby.statusCode, 404);
        assert.equal(errorCode(forbiddenLobby), 'ROOM_NOT_FOUND');

        const closedName = `${roomNamePrefix}-encerrada`;
        const closedResponse = await request('/api/rooms', {
            method: 'POST',
            body: { nome: closedName },
            cookie: mestre.cookie,
        });
        assert.equal(closedResponse.statusCode, 201);
        const closedRoom = apiSuccessSchema(roomSchema).parse(closedResponse.body).data;
        await pool.query('UPDATE rooms SET status = ? WHERE id = ?', ['ENCERRADA', closedRoom.id]);
        const closedJoin = await request('/api/rooms/join', {
            method: 'POST',
            body: { codigoConvite: closedRoom.codigoConvite },
            cookie: jogador.cookie,
        });
        assert.equal(closedJoin.statusCode, 409);
        assert.equal(errorCode(closedJoin), 'ROOM_INACTIVE');
    });

    it('retorna erros no envelope compartilhado e rejeita entradas inválidas', async () => {
        const user = await registerAccount('Validador de teste');
        const malformedName = await request('/api/rooms', {
            method: 'POST',
            body: { nome: '', userId: user.userId },
            cookie: user.cookie,
        });
        assert.equal(malformedName.statusCode, 422);
        assert.equal(errorCode(malformedName), 'VALIDATION_ERROR');
    });
});
