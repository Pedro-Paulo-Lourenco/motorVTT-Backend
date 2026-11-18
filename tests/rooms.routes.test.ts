/** Verifica a composição das rotas e seus middlewares de sala. */
// Importações: reúnem bibliotecas, tipos e módulos locais usados pelos blocos seguintes.
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { request as httpRequest } from 'node:http';
import { after, before, describe, it } from 'node:test';

import { apiErrorResponseSchema } from '@motor-vtt/contracts';
import type { Express } from 'express';

import app from '../src/app.js';

let server: ReturnType<Express['listen']>;
let baseUrl: string;

before(async () => {
    server = app.listen(0, '127.0.0.1');
    await once(server, 'listening');
// Constante ou estado local: `address` mantém o dado necessário ao fluxo abaixo.
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => {
    server.close();
    await once(server, 'close');
});

// Bloco local: `request` concentra uma responsabilidade reutilizada dentro deste módulo.
function request(
    path: string,
    method = 'GET',
    body?: Record<string, unknown>,
): Promise<{ statusCode: number; body: unknown }> {
// Constante ou estado local: `url` mantém o dado necessário ao fluxo abaixo.
    const url = new URL(path, baseUrl);
    return new Promise((resolve, reject) => {
// Constante ou estado local: `outgoing` mantém o dado necessário ao fluxo abaixo.
        const outgoing = httpRequest(url, {
            method,
            headers: body === undefined ? {} : { 'content-type': 'application/json' },
        }, (response) => {
            const chunks: Buffer[] = [];
            response.on('data', (chunk: Buffer) => chunks.push(chunk));
            response.on('end', () => {
// Bloco protegido: mantém o fluxo principal e suas finalizações ou tratamentos associados.
                try {
                    resolve({
                        statusCode: response.statusCode ?? 0,
                        body: JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown,
                    });
                } catch (error) {
                    reject(error);
                }
            });
        });
        outgoing.on('error', reject);
// Condição: altera o caminho de execução somente quando a regra indicada é verdadeira.
        if (body !== undefined) outgoing.write(JSON.stringify(body));
        outgoing.end();
    });
}

// Grupo de testes: reúne cenários que exercitam uma mesma área do comportamento.
describe('autenticação das rotas de sala', () => {
// Caso de teste: valida um comportamento específico e suas expectativas.
    it('exige usuário autenticado em todas as operações', async () => {
// Constante ou estado local: `responses` mantém o dado necessário ao fluxo abaixo.
        const responses = await Promise.all([
            request('/api/rooms', 'POST', { nome: 'Campanha', userId: 'payload-user' }),
            request('/api/rooms'),
            request('/api/rooms/join', 'POST', { codigoConvite: 'ABC123' }),
            request('/api/rooms/550e8400-e29b-41d4-a716-446655440000'),
        ]);

// Iteração: processa repetidamente os elementos ou tentativas deste bloco.
        for (const response of responses) {
            assert.equal(response.statusCode, 401);
            assert.equal(apiErrorResponseSchema.safeParse(response.body).success, true);
        }
    });
});
