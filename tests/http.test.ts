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

type HttpResult = {
    statusCode: number;
    headers: IncomingHttpHeaders;
    body: Record<string, unknown>;
};

async function withServer<T>(application: Express, callback: (baseUrl: string) => Promise<T>): Promise<T> {
    const server = application.listen(0, '127.0.0.1');
    await once(server, 'listening');

    const address = server.address();
    assert.ok(address && typeof address !== 'string');

    try {
        return await callback(`http://127.0.0.1:${address.port}`);
    } finally {
        server.close();
        await once(server, 'close');
    }
}

async function request(
    baseUrl: string,
    path: string,
    options: { method?: string; body?: string; correlationId?: string } = {},
): Promise<HttpResult> {
    const url = new URL(path, baseUrl);

    return new Promise((resolve, reject) => {
        const requestInstance = httpRequest(
            url,
            {
                method: options.method ?? 'GET',
                headers: {
                    ...(options.body === undefined ? {} : { 'content-type': 'application/json' }),
                    ...(options.correlationId === undefined
                        ? {}
                        : { 'x-correlation-id': options.correlationId }),
                },
            },
            (response) => {
                const chunks: Buffer[] = [];
                response.on('data', (chunk: Buffer) => chunks.push(chunk));
                response.on('end', () => {
                    try {
                        resolve({
                            statusCode: response.statusCode ?? 0,
                            headers: response.headers,
                            body: JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<
                                string,
                                unknown
                            >,
                        });
                    } catch (error) {
                        reject(error);
                    }
                });
            },
        );

        requestInstance.on('error', reject);
        if (options.body !== undefined) requestInstance.write(options.body);
        requestInstance.end();
    });
}

describe('contratos HTTP', () => {
    it('retorna sucesso padronizado e preserva o correlation ID', async () => {
        await withServer(app, async (baseUrl) => {
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

    it('valida params e query antes de executar o handler', async () => {
        await withServer(app, async (baseUrl) => {
            const invalid = await request(baseUrl, '/api/users/not-a-uuid');
            assert.equal(invalid.statusCode, 422);
            assert.equal(invalid.body.success, false);

            const error = invalid.body.error as { code: string; details: { issues: Array<{ path: string }> } };
            assert.equal(error.code, 'VALIDATION_ERROR');
            assert.equal(error.details.issues[0]?.path, 'id');

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

    it('também valida o body e só chama o handler com dados válidos', async () => {
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
            const invalid = await request(baseUrl, '/body', {
                method: 'POST',
                body: JSON.stringify({ name: '' }),
            });
            assert.equal(invalid.statusCode, 422);

            const valid = await request(baseUrl, '/body', {
                method: 'POST',
                body: JSON.stringify({ name: 'Alice' }),
            });
            assert.equal(valid.statusCode, 201);
            assert.deepEqual(valid.body.data, { name: 'Alice' });
        });
    });

    it('retorna 404 padronizado para rotas inexistentes', async () => {
        await withServer(app, async (baseUrl) => {
            const response = await request(baseUrl, '/does-not-exist');
            assert.equal(response.statusCode, 404);
            assert.deepEqual(response.body.error, {
                code: 'ROUTE_NOT_FOUND',
                message: 'Rota não encontrada: GET /does-not-exist',
                correlationId: response.body.error && (response.body.error as { correlationId: string }).correlationId,
            });
        });
    });

    it('retorna 400 para JSON inválido', async () => {
        await withServer(app, async (baseUrl) => {
            const response = await request(baseUrl, '/api/users/550e8400-e29b-41d4-a716-446655440000', {
                method: 'POST',
                body: '{invalid',
            });
            assert.equal(response.statusCode, 400);
        });
    });

    it('não expõe detalhes de exceções inesperadas em produção', async () => {
        const productionApp = express();
        productionApp.use(correlationId);
        productionApp.get('/boom', () => {
            throw new Error('segredo interno');
        });
        productionApp.use(errorHandler);

        const previousEnvironment = process.env.NODE_ENV;
        process.env.NODE_ENV = 'production';

        try {
            await withServer(productionApp, async (baseUrl) => {
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
            if (previousEnvironment === undefined) delete process.env.NODE_ENV;
            else process.env.NODE_ENV = previousEnvironment;
        }
    });
});
