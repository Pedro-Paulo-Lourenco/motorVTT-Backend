/** Exercita o fluxo HTTP completo de registro, login, refresh e logout. */
// Importações: reúnem bibliotecas, tipos e módulos locais usados pelos blocos seguintes.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { request as httpRequest, type IncomingHttpHeaders } from 'node:http';
import { after, before, describe, it } from 'node:test';

import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { apiErrorResponseSchema, apiSuccessSchema, authResponseSchema } from '@motor-vtt/contracts';
import type { Express } from 'express';

import app from '../src/app.js';
import { env } from '../src/config/env.js';
import { closeDatabase, pool } from '../src/config/database.js';

// Tipo: `HttpResult` descreve o formato estruturado usado nas operações relacionadas.
type HttpResult = {
    statusCode: number;
    headers: IncomingHttpHeaders;
    body: Record<string, any>;
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
    options: { method?: string; body?: Record<string, unknown>; headers?: Record<string, string> } = {},
): Promise<HttpResult> {
// Constante ou estado local: `url` mantém o dado necessário ao fluxo abaixo.
    const url = new URL(path, baseUrl);
    return new Promise((resolve, reject) => {
// Constante ou estado local: `instance` mantém o dado necessário ao fluxo abaixo.
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
        instance.on('error', reject);
// Condição: altera o caminho de execução somente quando a regra indicada é verdadeira.
        if (options.body !== undefined) instance.write(JSON.stringify(options.body));
        instance.end();
    });
}

// Bloco local: `uniqueEmail` concentra uma responsabilidade reutilizada dentro deste módulo.
function uniqueEmail(): string {
    return `auth-test-${randomUUID()}@example.test`;
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

// Bloco local: `setCookie` concentra uma responsabilidade reutilizada dentro deste módulo.
function setCookie(headers: IncomingHttpHeaders, name: string): string {
// Constante ou estado local: `cookies` mantém o dado necessário ao fluxo abaixo.
    const cookies = headers['set-cookie'] ?? [];
// Constante ou estado local: `found` mantém o dado necessário ao fluxo abaixo.
    const found = cookies.find((cookie) => cookie.startsWith(`${name}=`));
    assert.ok(found, `cookie ${name} ausente`);
    return found;
}

// Constante ou estado local: `strongPassword` mantém o dado necessário ao fluxo abaixo.
const strongPassword = 'Senha!DeTeste2026';
// Constante ou estado local: `migrationsReady` mantém o dado necessário ao fluxo abaixo.
let migrationsReady = false;

before(() => {
// Constante ou estado local: `migration` mantém o dado necessário ao fluxo abaixo.
    const migration = spawnSync(process.execPath, ['--import', 'tsx', 'src/database/cli.ts', 'up'], {
        cwd: process.cwd(),
        encoding: 'utf8',
        env: process.env,
    });
    assert.equal(migration.status, 0, `${migration.stdout}\n${migration.stderr}`);
    migrationsReady = true;
});

after(async () => {
// Condição: altera o caminho de execução somente quando a regra indicada é verdadeira.
    if (!migrationsReady) return;
// Consulta SQL: acessa ou altera registros no banco conforme parâmetros e condições desta instrução.
    await pool.query("DELETE FROM users WHERE email LIKE 'auth-test-%@example.test'");
    await closeDatabase();
});

// Grupo de testes: reúne cenários que exercitam uma mesma área do comportamento.
describe('autenticação', () => {
// Caso de teste: valida um comportamento específico e suas expectativas.
    it('cadastra com hash BCrypt, normaliza e-mail e nunca retorna credenciais', async () => {
        await withServer(app, async (baseUrl) => {
// Constante ou estado local: `email` mantém o dado necessário ao fluxo abaixo.
            const email = uniqueEmail().toUpperCase();
// Constante ou estado local: `response` mantém o dado necessário ao fluxo abaixo.
            const response = await request(baseUrl, '/api/auth/register', {
                method: 'POST',
                body: { nome: '  Alice  ', email, password: strongPassword },
            });

            assert.equal(response.statusCode, 201);
            assert.equal(response.body.data.user.email, email.toLowerCase());
            assert.equal(response.body.data.user.nome, 'Alice');
            assert.equal(response.body.data.user.status, 'ATIVO');
            assert.equal(response.body.data.user.ultimoLogin, null);
            assert.equal(apiSuccessSchema(authResponseSchema).safeParse(response.body).success, true);
            assert.equal('accessToken' in response.body.data, false);
            assert.doesNotMatch(JSON.stringify(response.body), /password_hash|Senha!DeTeste2026/);

// Constante ou estado local: `accessSetCookie` mantém o dado necessário ao fluxo abaixo.
            const accessSetCookie = setCookie(response.headers, 'access_token');
// Constante ou estado local: `refreshSetCookie` mantém o dado necessário ao fluxo abaixo.
            const refreshSetCookie = setCookie(response.headers, 'refresh_token');
            assert.match(accessSetCookie, /HttpOnly/i);
            assert.match(accessSetCookie, /SameSite=Strict/i);
            assert.match(refreshSetCookie, /HttpOnly/i);
            assert.match(refreshSetCookie, /Path=\/api\/auth/i);

// Consulta SQL: acessa ou altera registros no banco conforme parâmetros e condições desta instrução.
            const [rows] = await pool.query<Array<{ password_hash: string }>>(
                `SELECT c.password_hash FROM user_credentials c INNER JOIN users u ON u.id = c.user_id WHERE u.email = ?`,
                [email.toLowerCase()],
            );
            assert.match(rows[0]?.password_hash ?? '', /^\$2[aby]\$/);
            assert.notEqual(rows[0]?.password_hash, strongPassword);
        });
    });


// Caso de teste: valida um comportamento específico e suas expectativas.
    it('rejeita senha fraca e e-mail duplicado', async () => {
        await withServer(app, async (baseUrl) => {
// Constante ou estado local: `weak` mantém o dado necessário ao fluxo abaixo.
            const weak = await request(baseUrl, '/api/auth/register', {
                method: 'POST',
                body: { nome: 'Alice', email: uniqueEmail(), password: 'fraca' },
            });
            assert.equal(weak.statusCode, 422);
            assert.equal(apiErrorResponseSchema.safeParse(weak.body).success, true);

// Constante ou estado local: `email` mantém o dado necessário ao fluxo abaixo.
            const email = uniqueEmail();
// Constante ou estado local: `first` mantém o dado necessário ao fluxo abaixo.
            const first = await request(baseUrl, '/api/auth/register', {
                method: 'POST', body: { nome: 'Alice', email, password: strongPassword },
            });
            assert.equal(first.statusCode, 201);
// Constante ou estado local: `duplicate` mantém o dado necessário ao fluxo abaixo.
            const duplicate = await request(baseUrl, '/api/auth/register', {
                method: 'POST', body: { nome: 'Alice', email, password: strongPassword },
            });
            assert.equal(duplicate.statusCode, 409);
            assert.equal(duplicate.body.error.code, 'EMAIL_ALREADY_REGISTERED');
        });
    });

// Caso de teste: valida um comportamento específico e suas expectativas.
    it('autentica, atualiza ultimo_login e não enumera credenciais inválidas', async () => {
        await withServer(app, async (baseUrl) => {
// Constante ou estado local: `email` mantém o dado necessário ao fluxo abaixo.
            const email = uniqueEmail();
            await request(baseUrl, '/api/auth/register', {
                method: 'POST', body: { nome: 'Alice', email, password: strongPassword },
            });
// Constante ou estado local: `valid` mantém o dado necessário ao fluxo abaixo.
            const valid = await request(baseUrl, '/api/auth/login', {
                method: 'POST', body: { email, password: strongPassword },
            });
            assert.equal(valid.statusCode, 200);
            assert.ok(valid.body.data.user.ultimoLogin);

// Constante ou estado local: `wrongPassword` mantém o dado necessário ao fluxo abaixo.
            const wrongPassword = await request(baseUrl, '/api/auth/login', {
                method: 'POST', body: { email, password: 'Senha!Incorreta2026' },
            });
// Constante ou estado local: `unknownUser` mantém o dado necessário ao fluxo abaixo.
            const unknownUser = await request(baseUrl, '/api/auth/login', {
                method: 'POST', body: { email: uniqueEmail(), password: 'Senha!Incorreta2026' },
            });
            assert.equal(wrongPassword.statusCode, 401);
            assert.equal(unknownUser.statusCode, 401);
            assert.equal(wrongPassword.body.error.code, unknownUser.body.error.code);
            assert.equal(wrongPassword.body.error.message, unknownUser.body.error.message);
        });
    });

// Caso de teste: valida um comportamento específico e suas expectativas.
    it('protege rotas, valida adulteração/expiração e revoga a sessão no logout', async () => {
        await withServer(app, async (baseUrl) => {
// Constante ou estado local: `email` mantém o dado necessário ao fluxo abaixo.
            const email = uniqueEmail();
// Constante ou estado local: `registered` mantém o dado necessário ao fluxo abaixo.
            const registered = await request(baseUrl, '/api/auth/register', {
                method: 'POST', body: { nome: 'Alice', email, password: strongPassword },
            });
// Constante ou estado local: `accessCookie` mantém o dado necessário ao fluxo abaixo.
            const accessCookie = cookiePair(registered.headers, 'access_token');
// Constante ou estado local: `refreshCookie` mantém o dado necessário ao fluxo abaixo.
            const refreshCookie = cookiePair(registered.headers, 'refresh_token');

// Constante ou estado local: `missing` mantém o dado necessário ao fluxo abaixo.
            const missing = await request(baseUrl, '/api/auth/me');
// Constante ou estado local: `tampered` mantém o dado necessário ao fluxo abaixo.
            const tampered = await request(baseUrl, '/api/auth/me', {
                headers: { authorization: 'Bearer invalid.token.value' },
            });
// Constante ou estado local: `expired` mantém o dado necessário ao fluxo abaixo.
            const expired = jwt.sign({ sid: randomUUID(), typ: 'access' }, env.JWT_SECRET, {
                subject: registered.body.data.user.id,
                issuer: 'motor-vtt', audience: 'motor-vtt-api', expiresIn: -1,
            });
// Constante ou estado local: `expiredResponse` mantém o dado necessário ao fluxo abaixo.
            const expiredResponse = await request(baseUrl, '/api/auth/me', {
                headers: { authorization: `Bearer ${expired}` },
            });
// Constante ou estado local: `valid` mantém o dado necessário ao fluxo abaixo.
            const valid = await request(baseUrl, '/api/auth/me', {
                headers: { cookie: accessCookie },
            });
            assert.equal(missing.statusCode, 401);
            assert.equal(tampered.statusCode, 401);
            assert.equal(expiredResponse.statusCode, 401);
            assert.equal(valid.statusCode, 200);
            assert.equal(valid.body.data.user.email, email);

// Constante ou estado local: `logout` mantém o dado necessário ao fluxo abaixo.
            const logout = await request(baseUrl, '/api/auth/logout', {
                method: 'POST', headers: { cookie: `${accessCookie}; ${refreshCookie}` },
            });
            assert.equal(logout.statusCode, 200);
// Constante ou estado local: `revoked` mantém o dado necessário ao fluxo abaixo.
            const revoked = await request(baseUrl, '/api/auth/me', { headers: { cookie: accessCookie } });
            assert.equal(revoked.statusCode, 401);
        });
    });

// Caso de teste: valida um comportamento específico e suas expectativas.
    it('rotaciona refresh tokens e recusa o token anterior', async () => {
        await withServer(app, async (baseUrl) => {
// Constante ou estado local: `email` mantém o dado necessário ao fluxo abaixo.
            const email = uniqueEmail();
// Constante ou estado local: `registered` mantém o dado necessário ao fluxo abaixo.
            const registered = await request(baseUrl, '/api/auth/register', {
                method: 'POST', body: { nome: 'Alice', email, password: strongPassword },
            });
// Constante ou estado local: `oldRefresh` mantém o dado necessário ao fluxo abaixo.
            const oldRefresh = cookiePair(registered.headers, 'refresh_token');
// Constante ou estado local: `refreshed` mantém o dado necessário ao fluxo abaixo.
            const refreshed = await request(baseUrl, '/api/auth/refresh', {
                method: 'POST', headers: { cookie: oldRefresh },
            });
            assert.equal(refreshed.statusCode, 200);
// Constante ou estado local: `newRefresh` mantém o dado necessário ao fluxo abaixo.
            const newRefresh = cookiePair(refreshed.headers, 'refresh_token');
            assert.notEqual(newRefresh, oldRefresh);
// Constante ou estado local: `replay` mantém o dado necessário ao fluxo abaixo.
            const replay = await request(baseUrl, '/api/auth/refresh', {
                method: 'POST', headers: { cookie: oldRefresh },
            });
            assert.equal(replay.statusCode, 401);
        });
    });
});
