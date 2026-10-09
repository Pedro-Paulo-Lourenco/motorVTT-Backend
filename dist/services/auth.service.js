import { createHash, randomBytes, randomUUID } from 'node:crypto';
import argon2 from 'argon2';
import bcrypt from 'bcrypt';
import { userSchema } from '@motor-vtt/contracts';
import jwt, {} from 'jsonwebtoken';
import { env } from '../config/env.js';
import pool from '../config/database.js';
import { HttpError } from '../http/errors.js';
const BCRYPT_COST = 12;
// Used only to keep unknown-email login attempts computationally comparable.
const DUMMY_PASSWORD_HASH = '$2b$12$2E6ERKF9l/grbZlE6CzadOvPFfr3AbA/4YfCEqWhj6UKNZ6LD2j3K';
async function hashPassword(password) {
    return bcrypt.hash(password, BCRYPT_COST);
}
async function verifyPassword(hash, password) {
    try {
        if (hash.startsWith('$argon2id$'))
            return await argon2.verify(hash, password);
        return await bcrypt.compare(password, hash);
    }
    catch {
        return false;
    }
}
function asIso(value) {
    return value.toISOString();
}
function toPublicUser(row) {
    return userSchema.parse({
        id: row.id,
        nome: row.nome,
        email: row.email,
        status: row.status,
        ultimoLogin: row.ultimo_login === null ? null : asIso(row.ultimo_login),
        createdAt: asIso(row.created_at),
        updatedAt: asIso(row.updated_at),
    });
}
function durationToMilliseconds(value) {
    const match = /^(\d+)([smhd])$/.exec(value);
    if (!match)
        throw new Error('Duração de token inválida.');
    const amount = Number(match[1]);
    const unit = match[2];
    const multiplier = unit === 's' ? 1_000 : unit === 'm' ? 60_000 : unit === 'h' ? 3_600_000 : 86_400_000;
    return amount * multiplier;
}
function refreshTokenHash(token) {
    return createHash('sha256').update(token).digest('hex');
}
function isDuplicateKey(error) {
    return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ER_DUP_ENTRY';
}
async function findUserByEmail(connection, email) {
    const [rows] = await connection.query(`
        SELECT u.id, u.nome, u.email, u.status, u.ultimo_login, u.created_at, u.updated_at, c.password_hash
        FROM users u
        LEFT JOIN user_credentials c ON c.user_id = u.id
        WHERE u.email = ?
        LIMIT 1
    `, [email]);
    return rows[0];
}
async function findUserById(connection, id) {
    const [rows] = await connection.query(`
        SELECT u.id, u.nome, u.email, u.status, u.ultimo_login, u.created_at, u.updated_at
        FROM users u
        WHERE u.id = ?
        LIMIT 1
    `, [id]);
    return rows[0];
}
async function createRefreshSession(connection, userId) {
    const refreshToken = randomBytes(48).toString('base64url');
    const expiresAt = new Date(Date.now() + durationToMilliseconds(env.REFRESH_TOKEN_EXPIRES_IN));
    const session = {
        id: randomUUID(),
        userId,
        refreshToken,
        expiresAt,
    };
    await connection.query('INSERT INTO auth_sessions (id, user_id, refresh_token_hash, expires_at) VALUES (?, ?, ?, ?)', [session.id, session.userId, refreshTokenHash(session.refreshToken), session.expiresAt]);
    return session;
}
function createAuthenticationResult(user, session) {
    const accessTokenExpiresAt = new Date(Date.now() + durationToMilliseconds(env.JWT_EXPIRES_IN));
    const options = {
        algorithm: 'HS256',
        subject: user.id,
        issuer: 'motor-vtt',
        audience: 'motor-vtt-api',
        expiresIn: env.JWT_EXPIRES_IN,
    };
    const accessToken = jwt.sign({ sid: session.id, typ: 'access' }, env.JWT_SECRET, options);
    return {
        response: { user, accessToken, accessTokenExpiresAt: accessTokenExpiresAt.toISOString() },
        session,
    };
}
export function accessTokenLifetimeMilliseconds() {
    return durationToMilliseconds(env.JWT_EXPIRES_IN);
}
export function refreshTokenLifetimeMilliseconds() {
    return durationToMilliseconds(env.REFRESH_TOKEN_EXPIRES_IN);
}
export function verifyAccessToken(token) {
    try {
        const decoded = jwt.verify(token, env.JWT_SECRET, {
            algorithms: ['HS256'],
            issuer: 'motor-vtt',
            audience: 'motor-vtt-api',
        });
        if (typeof decoded === 'string')
            return undefined;
        const payload = decoded;
        if (payload.typ !== 'access'
            || typeof payload.sub !== 'string'
            || typeof payload.sid !== 'string'
            || typeof payload.exp !== 'number') {
            return undefined;
        }
        return { userId: payload.sub, sessionId: payload.sid, expiresAt: payload.exp * 1_000 };
    }
    catch {
        return undefined;
    }
}
export class AuthService {
    database;
    constructor(database = pool) {
        this.database = database;
    }
    async register(input) {
        const passwordHash = await hashPassword(input.password);
        const connection = await this.database.getConnection();
        try {
            await connection.beginTransaction();
            const userId = randomUUID();
            try {
                // TODO(auth): switch this to PENDENTE when e-mail verification is implemented.
                await connection.query(`INSERT INTO users (id, nome, email, status, ultimo_login) VALUES (?, ?, ?, 'ATIVO', NULL)`, [userId, input.nome, input.email]);
            }
            catch (error) {
                if (isDuplicateKey(error)) {
                    throw new HttpError(409, 'EMAIL_ALREADY_REGISTERED', 'Este e-mail já está cadastrado.');
                }
                throw error;
            }
            await connection.query('INSERT INTO user_credentials (user_id, password_hash) VALUES (?, ?)', [userId, passwordHash]);
            const user = await findUserById(connection, userId);
            if (!user)
                throw new Error('Usuário recém-criado não encontrado.');
            const session = await createRefreshSession(connection, userId);
            await connection.commit();
            return createAuthenticationResult(toPublicUser(user), session);
        }
        catch (error) {
            await connection.rollback();
            throw error;
        }
        finally {
            connection.release();
        }
    }
    async login(input) {
        const candidate = await findUserByEmail(this.database, input.email);
        const passwordMatches = candidate?.password_hash
            ? await verifyPassword(candidate.password_hash, input.password)
            : await bcrypt.compare(input.password, DUMMY_PASSWORD_HASH);
        if (!candidate || !candidate.password_hash || !passwordMatches) {
            throw new HttpError(401, 'CREDENTIALS_INVALID', 'Credenciais inválidas.');
        }
        if (candidate.status !== 'ATIVO') {
            throw new HttpError(403, 'ACCOUNT_INACTIVE', 'Esta conta não está ativa.');
        }
        const connection = await this.database.getConnection();
        try {
            await connection.beginTransaction();
            if (candidate.password_hash.startsWith('$argon2id$')
                && Buffer.byteLength(input.password, 'utf8') <= 72) {
                const upgradedHash = await hashPassword(input.password);
                await connection.query('UPDATE user_credentials SET password_hash = ? WHERE user_id = ? AND password_hash = ?', [upgradedHash, candidate.id, candidate.password_hash]);
            }
            await connection.query('UPDATE users SET ultimo_login = CURRENT_TIMESTAMP(3) WHERE id = ?', [candidate.id]);
            const updatedUser = await findUserById(connection, candidate.id);
            if (!updatedUser)
                throw new Error('Usuário autenticado não encontrado.');
            const session = await createRefreshSession(connection, candidate.id);
            await connection.commit();
            return createAuthenticationResult(toPublicUser(updatedUser), session);
        }
        catch (error) {
            await connection.rollback();
            throw error;
        }
        finally {
            connection.release();
        }
    }
    async refresh(refreshToken) {
        const connection = await this.database.getConnection();
        try {
            await connection.beginTransaction();
            const [rows] = await connection.query(`
                SELECT s.id AS session_id, s.user_id, s.refresh_token_hash, s.expires_at, s.revoked_at,
                    u.id, u.nome, u.email, u.status, u.ultimo_login, u.created_at, u.updated_at
                FROM auth_sessions s
                INNER JOIN users u ON u.id = s.user_id
                WHERE s.refresh_token_hash = ? AND s.revoked_at IS NULL AND s.expires_at > CURRENT_TIMESTAMP(3)
                LIMIT 1 FOR UPDATE
            `, [refreshTokenHash(refreshToken)]);
            const current = rows[0];
            if (!current || current.status !== 'ATIVO') {
                throw new HttpError(401, 'UNAUTHORIZED', 'Não autorizado.');
            }
            await connection.query('UPDATE auth_sessions SET revoked_at = CURRENT_TIMESTAMP(3), last_used_at = CURRENT_TIMESTAMP(3) WHERE id = ?', [current.session_id]);
            const session = await createRefreshSession(connection, current.user_id);
            await connection.commit();
            return createAuthenticationResult(toPublicUser(current), session);
        }
        catch (error) {
            await connection.rollback();
            throw error;
        }
        finally {
            connection.release();
        }
    }
    async authenticatedUser(payload) {
        const [rows] = await this.database.query(`
            SELECT u.id, u.nome, u.email, u.status, u.ultimo_login, u.created_at, u.updated_at
            FROM auth_sessions s
            INNER JOIN users u ON u.id = s.user_id
            WHERE s.id = ? AND s.user_id = ? AND s.revoked_at IS NULL AND s.expires_at > CURRENT_TIMESTAMP(3)
            LIMIT 1
        `, [payload.sessionId, payload.userId]);
        const user = rows[0];
        return user?.status === 'ATIVO' ? toPublicUser(user) : undefined;
    }
    async revokeBySessionId(sessionId) {
        await this.database.query('UPDATE auth_sessions SET revoked_at = COALESCE(revoked_at, CURRENT_TIMESTAMP(3)) WHERE id = ?', [sessionId]);
    }
    async revokeByRefreshToken(refreshToken) {
        await this.database.query('UPDATE auth_sessions SET revoked_at = COALESCE(revoked_at, CURRENT_TIMESTAMP(3)) WHERE refresh_token_hash = ?', [refreshTokenHash(refreshToken)]);
    }
}
export const authService = new AuthService();
//# sourceMappingURL=auth.service.js.map