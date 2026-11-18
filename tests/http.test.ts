/** Verifica envelopes HTTP, correlation ID, 404 e tratamento de erros. */
// Importações: reúnem bibliotecas, tipos e módulos locais usados pelos blocos seguintes.
import assert from 'node:assert/strict';
import { request as httpRequest, type IncomingHttpHeaders } from 'node:http';
import { once } from 'node:events';
import { describe, it } from 'node:test';

import express, { type Express } from 'express';
import { z } from 'zod';

import app from '../src/app.js';
import { correlationId, errorHandler } from '../src/http/middlewares.js';
import { sendSuccess } from '../src/http/response.js';
import { validate } from '../src/http/validation.js';

// Tipo: `HttpResult` descreve o formato estruturado usado nas operações relacionadas.
type HttpResult = {
    statusCode: number;
    headers: IncomingHttpHeaders;
    body: Record<string, unknown>;
};

// Bloco local: `withServer` concentra uma responsabilidade reutilizada dentro deste módulo.
async function withServer<T>(application: Express, callback: (baseUrl: string) => Promise<T>): Promise<T> {
// Constante ou estado local: `server` mantém o dado necessário ao fluxo abaixo.
    const server = application.listen(0, '127.0.0.1');
    await once(server, 'listening');

// Constante ou estado local: `address` mantém o dado necessário ao fluxo abaixo.
    const address = server.address();
    assert.ok(address && typeof address !== 'string');

// Bloco protegido: mantém o fluxo principal e suas finalizações ou tratamentos associados.
    try {
        return await callback(`http://127.0.0.1:${address.port}`);
    } finally {
        server.close();
        await once(server, 'close');
    }
}

// Bloco local: `request` concentra uma responsabilidade reutilizada dentro deste módulo.
async function request(
    baseUrl: string,
    path: string,
    options: {
        method?: string;
        body?: string;
        correlationId?: string;
        headers?: Record<string, string>;
    } = {},
): Promise<HttpResult> {
// Constante ou estado local: `url` mantém o dado necessário ao fluxo abaixo.
    const url = new URL(path, baseUrl);

    return new Promise((resolve, reject) => {
// Constante ou estado local: `requestInstance` mantém o dado necessário ao fluxo abaixo.
        const requestInstance = httpRequest(
            url,
            {
                method: options.method ?? 'GET',
                headers: {
                    ...(options.body === undefined ? {} : { 'content-type': 'application/json' }),
                    ...(options.correlationId === undefined
                        ? {}
                        : { 'x-correlation-id': options.correlationId }),
                    ...options.headers,
                },
            },
            (response) => {
                const chunks: Buffer[] = [];
                response.on('data', (chunk: Buffer) => chunks.push(chunk));
                response.on('end', () => {
// Bloco protegido: mantém o fluxo principal e suas finalizações ou tratamentos associados.
                    try {
                        resolve({
                            statusCode: response.statusCode ?? 0,
                            headers: response.headers,
                            body: Buffer.concat(chunks).length === 0
                                ? {}
                                : JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>,
                        });
                    } catch (error) {
                        reject(error);
                    }
                });
            },
        );

        requestInstance.on('error', reject);
// Condição: altera o caminho de execução somente quando a regra indicada é verdadeira.
        if (options.body !== undefined) requestInstance.write(options.body);
        requestInstance.end();
    });
}

// Grupo de testes: reúne cenários que exercitam uma mesma área do comportamento.
describe('contratos HTTP', () => {
// Caso de teste: valida um comportamento específico e suas expectativas.
    it('permite CORS com credenciais para a origem configurada', async () => {
        await withServer(app, async (baseUrl) => {
// Constante ou estado local: `response` mantém o dado necessário ao fluxo abaixo.
            const response = await request(baseUrl, '/api/auth/login', {
                method: 'OPTIONS',
                headers: {
                    origin: 'http://localhost:5173',
                    'access-control-request-method': 'POST',
                    'access-control-request-headers': 'content-type',
                },
            });

            assert.equal(response.statusCode, 204);
            assert.equal(response.headers['access-control-allow-origin'], 'http://localhost:5173');
            assert.equal(response.headers['access-control-allow-credentials'], 'true');
            assert.match(response.headers['access-control-allow-methods'] ?? '', /POST/);
        });
    });

// Caso de teste: valida um comportamento específico e suas expectativas.
    it('retorna sucesso padronizado e preserva o correlation ID', async () => {
        await withServer(app, async (baseUrl) => {
// Constante ou estado local: `response` mantém o dado necessário ao fluxo abaixo.
            const response = await request(baseUrl, '/health', {
                correlationId: 'test-correlation-id',
            });

            assert.equal(response.statusCode, 200);
            assert.deepEqual(response.body, {
                success: true,
                data: { status: 'ok', service: 'backend' },
                correlationId: 'test-correlation-id',
            });
            assert.equal(response.headers['x-correlation-id'], 'test-correlation-id');
        });
    });

// Caso de teste: valida um comportamento específico e suas expectativas.
    it('valida params e query antes de executar o handler', async () => {
        await withServer(app, async (baseUrl) => {
// Constante ou estado local: `invalid` mantém o dado necessário ao fluxo abaixo.
            const invalid = await request(baseUrl, '/api/users/not-a-uuid');
            assert.equal(invalid.statusCode, 422);
            assert.equal(invalid.body.success, false);

// Constante ou estado local: `error` mantém o dado necessário ao fluxo abaixo.
            const error = invalid.body.error as { code: string; details: { issues: Array<{ path: string }> } };
            assert.equal(error.code, 'VALIDATION_ERROR');
            assert.equal(error.details.issues[0]?.path, 'id');

// Constante ou estado local: `valid` mantém o dado necessário ao fluxo abaixo.
            const valid = await request(
                baseUrl,
                '/api/users/550e8400-e29b-41d4-a716-446655440000?includeInactive=true',
            );
            assert.equal(valid.statusCode, 200);
            assert.deepEqual(valid.body, {
                success: true,
                data: {
                    id: '550e8400-e29b-41d4-a716-446655440000',
                    includeInactive: true,
                },
                correlationId: valid.body.correlationId,
            });
        });
    });

// Caso de teste: valida um comportamento específico e suas expectativas.
    it('também valida o body e só chama o handler com dados válidos', async () => {
// Constante ou estado local: `bodyApp` mantém o dado necessário ao fluxo abaixo.
        const bodyApp = express();
        bodyApp.use(correlationId);
        bodyApp.use(express.json());
        bodyApp.post(
            '/body',
            validate({ body: z.object({ name: z.string().min(1) }) }),
            (_req, res) => sendSuccess(res, 201, res.locals.validated.body),
        );
        bodyApp.use(errorHandler);

        await withServer(bodyApp, async (baseUrl) => {
// Constante ou estado local: `invalid` mantém o dado necessário ao fluxo abaixo.
            const invalid = await request(baseUrl, '/body', {
                method: 'POST',
                body: JSON.stringify({ name: '' }),
            });
            assert.equal(invalid.statusCode, 422);

// Constante ou estado local: `valid` mantém o dado necessário ao fluxo abaixo.
            const valid = await request(baseUrl, '/body', {
                method: 'POST',
                body: JSON.stringify({ name: 'Alice' }),
            });
            assert.equal(valid.statusCode, 201);
            assert.deepEqual(valid.body.data, { name: 'Alice' });
        });
    });

// Caso de teste: valida um comportamento específico e suas expectativas.
    it('retorna 404 padronizado para rotas inexistentes', async () => {
        await withServer(app, async (baseUrl) => {
// Constante ou estado local: `response` mantém o dado necessário ao fluxo abaixo.
            const response = await request(baseUrl, '/does-not-exist');
            assert.equal(response.statusCode, 404);
            assert.deepEqual(response.body.error, {
                code: 'ROUTE_NOT_FOUND',
                message: 'Rota não encontrada: GET /does-not-exist',
                correlationId: response.body.error && (response.body.error as { correlationId: string }).correlationId,
            });
        });
    });

// Caso de teste: valida um comportamento específico e suas expectativas.
    it('retorna 400 para JSON inválido', async () => {
        await withServer(app, async (baseUrl) => {
// Constante ou estado local: `response` mantém o dado necessário ao fluxo abaixo.
            const response = await request(baseUrl, '/api/users/550e8400-e29b-41d4-a716-446655440000', {
                method: 'POST',
                body: '{invalid',
            });
            assert.equal(response.statusCode, 400);
        });
    });

// Caso de teste: valida um comportamento específico e suas expectativas.
    it('não expõe detalhes de exceções inesperadas em produção', async () => {
// Constante ou estado local: `productionApp` mantém o dado necessário ao fluxo abaixo.
        const productionApp = express();
        productionApp.use(correlationId);
        productionApp.get('/boom', () => {
            throw new Error('segredo interno');
        });
        productionApp.use(errorHandler);

// Constante ou estado local: `previousEnvironment` mantém o dado necessário ao fluxo abaixo.
        const previousEnvironment = process.env.NODE_ENV;
        process.env.NODE_ENV = 'production';

// Bloco protegido: mantém o fluxo principal e suas finalizações ou tratamentos associados.
        try {
            await withServer(productionApp, async (baseUrl) => {
// Constante ou estado local: `response` mantém o dado necessário ao fluxo abaixo.
                const response = await request(baseUrl, '/boom');
                assert.equal(response.statusCode, 500);
                assert.deepEqual(response.body.error, {
                    code: 'INTERNAL_SERVER_ERROR',
                    message: 'Ocorreu um erro interno.',
                    correlationId: response.body.error &&
                        (response.body.error as { correlationId: string }).correlationId,
                });
            });
        } finally {
// Condição: altera o caminho de execução somente quando a regra indicada é verdadeira.
            if (previousEnvironment === undefined) delete process.env.NODE_ENV;
            else process.env.NODE_ENV = previousEnvironment;
        }
    });
});
