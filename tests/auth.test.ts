import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { request as httpRequest, type IncomingHttpHeaders } from 'node:http';
import { after, before, describe, it } from 'node:test';

import jwt from 'jsonwebtoken';
import type { Express } from 'express';

import app from '../src/app.js';
import { env } from '../src/config/env.js';
import { closeDatabase, pool } from '../src/config/database.js';

type HttpResult = {
    statusCode: number;
    headers: IncomingHttpHeaders;
    body: Record<string, any>;
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
    options: { method?: string; body?: Record<string, unknown>; headers?: Record<string, string> } = {},
): Promise<HttpResult> {
    const url = new URL(path, baseUrl);
    return new Promise((resolve, reject) => {
        const instance = httpRequest(url, {
            method: options.method ?? 'GET',
            headers: {
                ...(options.body === undefined ? {} : { 'content-type': 'application/json' }),
                ...options.headers,
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
        instance.on('error', reject);
        if (options.body !== undefined) instance.write(JSON.stringify(options.body));
        instance.end();
    });
}

function uniqueEmail(): string {
    return `auth-test-${randomUUID()}@example.test`;
}

function cookiePair(headers: IncomingHttpHeaders, name: string): string {
    const cookies = headers['set-cookie'] ?? [];
    const found = cookies.find((cookie) => cookie.startsWith(`${name}=`));
    assert.ok(found, `cookie ${name} ausente`);
    return found.split(';', 1)[0] as string;
}

function setCookie(headers: IncomingHttpHeaders, name: string): string {
    const cookies = headers['set-cookie'] ?? [];
    const found = cookies.find((cookie) => cookie.startsWith(`${name}=`));
    assert.ok(found, `cookie ${name} ausente`);
    return found;
}

const strongPassword = 'Senha!DeTeste2026';
let migrationsReady = false;

before(() => {
    const migration = spawnSync(process.execPath, ['--import', 'tsx', 'src/database/cli.ts', 'up'], {
        cwd: process.cwd(),
        encoding: 'utf8',
        env: process.env,
    });
    assert.equal(migration.status, 0, `${migration.stdout}\n${migration.stderr}`);
    migrationsReady = true;
});

after(async () => {
    if (!migrationsReady) return;
    await pool.query("DELETE FROM users WHERE email LIKE 'auth-test-%@example.test'");
    await closeDatabase();
});

describe('autenticação', () => {
    it('cadastra com hash Argon2, normaliza e-mail e nunca retorna credenciais', async () => {
        await withServer(app, async (baseUrl) => {
            const email = uniqueEmail().toUpperCase();
            const response = await request(baseUrl, '/api/auth/register', {
                method: 'POST',
                body: { nome: '  Alice  ', email, password: strongPassword },
            });

            assert.equal(response.statusCode, 201);
            assert.equal(response.body.data.user.email, email.toLowerCase());
            assert.equal(response.body.data.user.nome, 'Alice');
            assert.equal(response.body.data.user.status, 'ATIVO');
            assert.equal(response.body.data.user.ultimoLogin, null);
            assert.equal(typeof response.body.data.accessToken, 'string');
            assert.doesNotMatch(JSON.stringify(response.body), /password_hash|Senha!DeTeste2026/);

            const accessSetCookie = setCookie(response.headers, 'access_token');
            const refreshSetCookie = setCookie(response.headers, 'refresh_token');
            assert.match(accessSetCookie, /HttpOnly/i);
            assert.match(accessSetCookie, /SameSite=Strict/i);
            assert.match(refreshSetCookie, /HttpOnly/i);
            assert.match(refreshSetCookie, /Path=\/api\/auth/i);

            const [rows] = await pool.query<Array<{ password_hash: string }>>(
                `SELECT c.password_hash FROM user_credentials c INNER JOIN users u ON u.id = c.user_id WHERE u.email = ?`,
                [email.toLowerCase()],
            );
            assert.match(rows[0]?.password_hash ?? '', /^\$argon2id\$/);
            assert.notEqual(rows[0]?.password_hash, strongPassword);
        });
    });

    it('rejeita senha fraca e e-mail duplicado', async () => {
        await withServer(app, async (baseUrl) => {
            const weak = await request(baseUrl, '/api/auth/register', {
                method: 'POST',
                body: { nome: 'Alice', email: uniqueEmail(), password: 'fraca' },
            });
            assert.equal(weak.statusCode, 422);

            const email = uniqueEmail();
            const first = await request(baseUrl, '/api/auth/register', {
                method: 'POST', body: { nome: 'Alice', email, password: strongPassword },
            });
            assert.equal(first.statusCode, 201);
            const duplicate = await request(baseUrl, '/api/auth/register', {
                method: 'POST', body: { nome: 'Alice', email, password: strongPassword },
            });
            assert.equal(duplicate.statusCode, 409);
            assert.equal(duplicate.body.error.code, 'EMAIL_ALREADY_REGISTERED');
        });
    });

    it('autentica, atualiza ultimo_login e não enumera credenciais inválidas', async () => {
        await withServer(app, async (baseUrl) => {
            const email = uniqueEmail();
            await request(baseUrl, '/api/auth/register', {
                method: 'POST', body: { nome: 'Alice', email, password: strongPassword },
            });
            const valid = await request(baseUrl, '/api/auth/login', {
                method: 'POST', body: { email, password: strongPassword },
            });
            assert.equal(valid.statusCode, 200);
            assert.ok(valid.body.data.user.ultimoLogin);

            const wrongPassword = await request(baseUrl, '/api/auth/login', {
                method: 'POST', body: { email, password: 'Senha!Incorreta2026' },
            });
            const unknownUser = await request(baseUrl, '/api/auth/login', {
                method: 'POST', body: { email: uniqueEmail(), password: 'Senha!Incorreta2026' },
            });
            assert.equal(wrongPassword.statusCode, 401);
            assert.equal(unknownUser.statusCode, 401);
            assert.equal(wrongPassword.body.error.code, unknownUser.body.error.code);
            assert.equal(wrongPassword.body.error.message, unknownUser.body.error.message);
        });
    });

    it('protege rotas, valida adulteração/expiração e revoga a sessão no logout', async () => {
        await withServer(app, async (baseUrl) => {
            const email = uniqueEmail();
            const registered = await request(baseUrl, '/api/auth/register', {
                method: 'POST', body: { nome: 'Alice', email, password: strongPassword },
            });
            const accessCookie = cookiePair(registered.headers, 'access_token');
            const refreshCookie = cookiePair(registered.headers, 'refresh_token');

            const missing = await request(baseUrl, '/api/auth/me');
            const tampered = await request(baseUrl, '/api/auth/me', {
                headers: { authorization: 'Bearer invalid.token.value' },
            });
            const expired = jwt.sign({ sid: randomUUID(), typ: 'access' }, env.JWT_SECRET, {
                subject: registered.body.data.user.id,
                issuer: 'motor-vtt', audience: 'motor-vtt-api', expiresIn: -1,
            });
            const expiredResponse = await request(baseUrl, '/api/auth/me', {
                headers: { authorization: `Bearer ${expired}` },
            });
            const valid = await request(baseUrl, '/api/auth/me', {
                headers: { cookie: accessCookie },
            });
            assert.equal(missing.statusCode, 401);
            assert.equal(tampered.statusCode, 401);
            assert.equal(expiredResponse.statusCode, 401);
            assert.equal(valid.statusCode, 200);
            assert.equal(valid.body.data.user.email, email);

            const logout = await request(baseUrl, '/api/auth/logout', {
                method: 'POST', headers: { cookie: `${accessCookie}; ${refreshCookie}` },
            });
            assert.equal(logout.statusCode, 200);
            const revoked = await request(baseUrl, '/api/auth/me', { headers: { cookie: accessCookie } });
            assert.equal(revoked.statusCode, 401);
        });
    });

    it('rotaciona refresh tokens e recusa o token anterior', async () => {
        await withServer(app, async (baseUrl) => {
            const email = uniqueEmail();
            const registered = await request(baseUrl, '/api/auth/register', {
                method: 'POST', body: { nome: 'Alice', email, password: strongPassword },
            });
            const oldRefresh = cookiePair(registered.headers, 'refresh_token');
            const refreshed = await request(baseUrl, '/api/auth/refresh', {
                method: 'POST', headers: { cookie: oldRefresh },
            });
            assert.equal(refreshed.statusCode, 200);
            const newRefresh = cookiePair(refreshed.headers, 'refresh_token');
            assert.notEqual(newRefresh, oldRefresh);
            const replay = await request(baseUrl, '/api/auth/refresh', {
                method: 'POST', headers: { cookie: oldRefresh },
            });
            assert.equal(replay.statusCode, 401);
        });
    });
});
