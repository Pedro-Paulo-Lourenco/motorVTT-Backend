/** Implementa hashing, emissão, rotação e revogação das credenciais. */
// Importações: reúnem bibliotecas, tipos e módulos locais usados pelos blocos seguintes.
import { createHash, randomBytes, randomUUID } from 'node:crypto';

import bcrypt from 'bcryptjs';
import { userSchema, type UserStatus } from '@motor-vtt/contracts';
import jwt, { type JwtPayload, type SignOptions } from 'jsonwebtoken';
import type { Pool, PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';

import { env } from '../config/env.js';
import pool from '../config/database.js';
import { HttpError } from '../http/errors.js';
import type {
    AuthServiceResponse,
    LoginInput,
    PublicUser,
    RefreshSession,
    RegisterInput,
} from '../types/auth.types.js';

// Tipo: `Queryable` descreve o formato estruturado usado nas operações relacionadas.
type Queryable = Pool | PoolConnection;

// Tipo: `UserRow` descreve o formato estruturado usado nas operações relacionadas.
type UserRow = RowDataPacket & {
    id: string;
    nome: string;
    email: string;
    status: UserStatus;
    ultimo_login: Date | null;
    created_at: Date;
    updated_at: Date;
    password_hash?: string | null;
};

// Tipo: `SessionRow` descreve o formato estruturado usado nas operações relacionadas.
type SessionRow = RowDataPacket & {
    session_id: string;
    user_id: string;
    refresh_token_hash: string;
    expires_at: Date;
    revoked_at: Date | null;
    nome: string;
    email: string;
    status: UserStatus;
    ultimo_login: Date | null;
    created_at: Date;
    updated_at: Date;
};

// Exportação principal: `AccessTokenPayload` disponibiliza esta responsabilidade para os consumidores deste módulo.
export type AccessTokenPayload = {
    userId: string;
    sessionId: string;
};

// Exportação principal: `VerifiedAccessTokenPayload` disponibiliza esta responsabilidade para os consumidores deste módulo.
export type VerifiedAccessTokenPayload = AccessTokenPayload & { expiresAt: number };

// Constante ou estado local: `BCRYPT_COST` mantém o dado necessário ao fluxo abaixo.
const BCRYPT_COST = 12;

// Used only to keep unknown-email login attempts computationally comparable.
// Constante ou estado local: `DUMMY_PASSWORD_HASH` mantém o dado necessário ao fluxo abaixo.
const DUMMY_PASSWORD_HASH = '$2b$12$2E6ERKF9l/grbZlE6CzadOvPFfr3AbA/4YfCEqWhj6UKNZ6LD2j3K';

// Bloco local: `hashPassword` concentra uma responsabilidade reutilizada dentro deste módulo.
async function hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, BCRYPT_COST);
}

// Bloco local: `verifyPassword` concentra uma responsabilidade reutilizada dentro deste módulo.
async function verifyPassword(hash: string, password: string): Promise<boolean> {
// Bloco protegido: mantém o fluxo principal e suas finalizações ou tratamentos associados.
    try {
        return await bcrypt.compare(password, hash);
    } catch {
        return false;
    }
}

// Bloco local: `asIso` concentra uma responsabilidade reutilizada dentro deste módulo.
function asIso(value: Date): string {
    return value.toISOString();
}

// Bloco local: `toPublicUser` concentra uma responsabilidade reutilizada dentro deste módulo.
function toPublicUser(row: UserRow | SessionRow): PublicUser {
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

// Bloco local: `durationToMilliseconds` concentra uma responsabilidade reutilizada dentro deste módulo.
function durationToMilliseconds(value: string): number {
// Constante ou estado local: `match` mantém o dado necessário ao fluxo abaixo.
    const match = /^(\d+)([smhd])$/.exec(value);
// Condição: altera o caminho de execução somente quando a regra indicada é verdadeira.
    if (!match) throw new Error('Duração de token inválida.');
// Constante ou estado local: `amount` mantém o dado necessário ao fluxo abaixo.
    const amount = Number(match[1]);
// Constante ou estado local: `unit` mantém o dado necessário ao fluxo abaixo.
    const unit = match[2];
// Constante ou estado local: `multiplier` mantém o dado necessário ao fluxo abaixo.
    const multiplier = unit === 's' ? 1_000 : unit === 'm' ? 60_000 : unit === 'h' ? 3_600_000 : 86_400_000;
    return amount * multiplier;
}

// Bloco local: `refreshTokenHash` concentra uma responsabilidade reutilizada dentro deste módulo.
function refreshTokenHash(token: string): string {
    return createHash('sha256').update(token).digest('hex');
}

// Bloco local: `isDuplicateKey` concentra uma responsabilidade reutilizada dentro deste módulo.
function isDuplicateKey(error: unknown): boolean {
    return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ER_DUP_ENTRY';
}

// Bloco local: `findUserByEmail` concentra uma responsabilidade reutilizada dentro deste módulo.
async function findUserByEmail(connection: Queryable, email: string): Promise<UserRow | undefined> {
// Consulta SQL: acessa ou altera registros no banco conforme parâmetros e condições desta instrução.
    const [rows] = await connection.query<UserRow[]>(`
        SELECT u.id, u.nome, u.email, u.status, u.ultimo_login, u.created_at, u.updated_at, c.password_hash
        FROM users u
        LEFT JOIN user_credentials c ON c.user_id = u.id
        WHERE u.email = ?
        LIMIT 1
    `, [email]);
    return rows[0];
}

// Bloco local: `findUserById` concentra uma responsabilidade reutilizada dentro deste módulo.
async function findUserById(connection: Queryable, id: string): Promise<UserRow | undefined> {
// Consulta SQL: acessa ou altera registros no banco conforme parâmetros e condições desta instrução.
    const [rows] = await connection.query<UserRow[]>(`
        SELECT u.id, u.nome, u.email, u.status, u.ultimo_login, u.created_at, u.updated_at
        FROM users u
        WHERE u.id = ?
        LIMIT 1
    `, [id]);
    return rows[0];
}

// Bloco local: `createRefreshSession` concentra uma responsabilidade reutilizada dentro deste módulo.
async function createRefreshSession(connection: Queryable, userId: string): Promise<RefreshSession> {
// Constante ou estado local: `refreshToken` mantém o dado necessário ao fluxo abaixo.
    const refreshToken = randomBytes(48).toString('base64url');
// Constante ou estado local: `expiresAt` mantém o dado necessário ao fluxo abaixo.
    const expiresAt = new Date(Date.now() + durationToMilliseconds(env.REFRESH_TOKEN_EXPIRES_IN));
    const session: RefreshSession = {
        id: randomUUID(),
        userId,
        refreshToken,
        expiresAt,
    };

// Consulta SQL: acessa ou altera registros no banco conforme parâmetros e condições desta instrução.
    await connection.query(
        'INSERT INTO auth_sessions (id, user_id, refresh_token_hash, expires_at) VALUES (?, ?, ?, ?)',
        [session.id, session.userId, refreshTokenHash(session.refreshToken), session.expiresAt],
    );
    return session;
}

// Bloco local: `createAuthenticationResult` concentra uma responsabilidade reutilizada dentro deste módulo.
function createAuthenticationResult(user: PublicUser, session: RefreshSession): {
    response: AuthServiceResponse;
    session: RefreshSession;
} {
// Constante ou estado local: `accessTokenExpiresAt` mantém o dado necessário ao fluxo abaixo.
    const accessTokenExpiresAt = new Date(Date.now() + durationToMilliseconds(env.JWT_EXPIRES_IN));
    const options: SignOptions = {
        algorithm: 'HS256',
        subject: user.id,
        issuer: 'motor-vtt',
        audience: 'motor-vtt-api',
        expiresIn: env.JWT_EXPIRES_IN as NonNullable<SignOptions['expiresIn']>,
    };
// Constante ou estado local: `accessToken` mantém o dado necessário ao fluxo abaixo.
    const accessToken = jwt.sign(
        { sid: session.id, typ: 'access' },
        env.JWT_SECRET,
        options,
    );

    return {
        response: { user, accessToken, accessTokenExpiresAt: accessTokenExpiresAt.toISOString() },
        session,
    };
}

// Exportação principal: `accessTokenLifetimeMilliseconds` disponibiliza esta responsabilidade para os consumidores deste módulo.
export function accessTokenLifetimeMilliseconds(): number {
    return durationToMilliseconds(env.JWT_EXPIRES_IN);
}

// Exportação principal: `refreshTokenLifetimeMilliseconds` disponibiliza esta responsabilidade para os consumidores deste módulo.
export function refreshTokenLifetimeMilliseconds(): number {
    return durationToMilliseconds(env.REFRESH_TOKEN_EXPIRES_IN);
}

// Exportação principal: `verifyAccessToken` disponibiliza esta responsabilidade para os consumidores deste módulo.
export function verifyAccessToken(token: string): VerifiedAccessTokenPayload | undefined {
// Bloco protegido: mantém o fluxo principal e suas finalizações ou tratamentos associados.
    try {
// Constante ou estado local: `decoded` mantém o dado necessário ao fluxo abaixo.
        const decoded = jwt.verify(token, env.JWT_SECRET, {
            algorithms: ['HS256'],
            issuer: 'motor-vtt',
            audience: 'motor-vtt-api',
        });
// Condição: altera o caminho de execução somente quando a regra indicada é verdadeira.
        if (typeof decoded === 'string') return undefined;
// Constante ou estado local: `payload` mantém o dado necessário ao fluxo abaixo.
        const payload = decoded as JwtPayload;
// Condição: altera o caminho de execução somente quando a regra indicada é verdadeira.
        if (
            payload.typ !== 'access'
            || typeof payload.sub !== 'string'
            || typeof payload.sid !== 'string'
            || typeof payload.exp !== 'number'
        ) {
            return undefined;
        }
        return { userId: payload.sub, sessionId: payload.sid, expiresAt: payload.exp * 1_000 };
    } catch {
        return undefined;
    }
}

// Exportação principal: `AuthService` disponibiliza esta responsabilidade para os consumidores deste módulo.
export class AuthService {
    public constructor(private readonly database: Pool = pool) {}

    public async register(input: RegisterInput): Promise<{ response: AuthServiceResponse; session: RefreshSession }> {
// Constante ou estado local: `passwordHash` mantém o dado necessário ao fluxo abaixo.
        const passwordHash = await hashPassword(input.password);
// Constante ou estado local: `connection` mantém o dado necessário ao fluxo abaixo.
        const connection = await this.database.getConnection();
// Bloco protegido: mantém o fluxo principal e suas finalizações ou tratamentos associados.
        try {
            await connection.beginTransaction();
// Constante ou estado local: `userId` mantém o dado necessário ao fluxo abaixo.
            const userId = randomUUID();

// Bloco protegido: mantém o fluxo principal e suas finalizações ou tratamentos associados.
            try {
                // TODO(auth): switch this to PENDENTE when e-mail verification is implemented.
// Consulta SQL: acessa ou altera registros no banco conforme parâmetros e condições desta instrução.
                await connection.query(
                    `INSERT INTO users (id, nome, email, status, ultimo_login) VALUES (?, ?, ?, 'ATIVO', NULL)`,
                    [userId, input.nome, input.email],
                );
            } catch (error) {
// Condição: altera o caminho de execução somente quando a regra indicada é verdadeira.
                if (isDuplicateKey(error)) {
                    throw new HttpError(409, 'EMAIL_ALREADY_REGISTERED', 'Este e-mail já está cadastrado.');
                }
                throw error;
            }

// Consulta SQL: acessa ou altera registros no banco conforme parâmetros e condições desta instrução.
            await connection.query(
                'INSERT INTO user_credentials (user_id, password_hash) VALUES (?, ?)',
                [userId, passwordHash],
            );
// Constante ou estado local: `user` mantém o dado necessário ao fluxo abaixo.
            const user = await findUserById(connection, userId);
// Condição: altera o caminho de execução somente quando a regra indicada é verdadeira.
            if (!user) throw new Error('Usuário recém-criado não encontrado.');
// Constante ou estado local: `session` mantém o dado necessário ao fluxo abaixo.
            const session = await createRefreshSession(connection, userId);
            await connection.commit();
            return createAuthenticationResult(toPublicUser(user), session);
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    }

    public async login(input: LoginInput): Promise<{ response: AuthServiceResponse; session: RefreshSession }> {
// Constante ou estado local: `candidate` mantém o dado necessário ao fluxo abaixo.
        const candidate = await findUserByEmail(this.database, input.email);
// Constante ou estado local: `passwordMatches` mantém o dado necessário ao fluxo abaixo.
        const passwordMatches = candidate?.password_hash
            ? await verifyPassword(candidate.password_hash, input.password)
            : await bcrypt.compare(input.password, DUMMY_PASSWORD_HASH);

// Condição: altera o caminho de execução somente quando a regra indicada é verdadeira.
        if (!candidate || !candidate.password_hash || !passwordMatches) {
            throw new HttpError(401, 'CREDENTIALS_INVALID', 'Credenciais inválidas.');
        }
// Condição: altera o caminho de execução somente quando a regra indicada é verdadeira.
        if (candidate.status !== 'ATIVO') {
            throw new HttpError(403, 'ACCOUNT_INACTIVE', 'Esta conta não está ativa.');
        }

// Constante ou estado local: `connection` mantém o dado necessário ao fluxo abaixo.
        const connection = await this.database.getConnection();
// Bloco protegido: mantém o fluxo principal e suas finalizações ou tratamentos associados.
        try {
            await connection.beginTransaction();
// Consulta SQL: acessa ou altera registros no banco conforme parâmetros e condições desta instrução.
            await connection.query<ResultSetHeader>('UPDATE users SET ultimo_login = CURRENT_TIMESTAMP(3) WHERE id = ?', [candidate.id]);
// Constante ou estado local: `updatedUser` mantém o dado necessário ao fluxo abaixo.
            const updatedUser = await findUserById(connection, candidate.id);
// Condição: altera o caminho de execução somente quando a regra indicada é verdadeira.
            if (!updatedUser) throw new Error('Usuário autenticado não encontrado.');
// Constante ou estado local: `session` mantém o dado necessário ao fluxo abaixo.
            const session = await createRefreshSession(connection, candidate.id);
            await connection.commit();
            return createAuthenticationResult(toPublicUser(updatedUser), session);
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    }

    public async refresh(refreshToken: string): Promise<{ response: AuthServiceResponse; session: RefreshSession }> {
// Constante ou estado local: `connection` mantém o dado necessário ao fluxo abaixo.
        const connection = await this.database.getConnection();
// Bloco protegido: mantém o fluxo principal e suas finalizações ou tratamentos associados.
        try {
            await connection.beginTransaction();
// Consulta SQL: acessa ou altera registros no banco conforme parâmetros e condições desta instrução.
            const [rows] = await connection.query<SessionRow[]>(`
                SELECT s.id AS session_id, s.user_id, s.refresh_token_hash, s.expires_at, s.revoked_at,
                    u.id, u.nome, u.email, u.status, u.ultimo_login, u.created_at, u.updated_at
                FROM auth_sessions s
                INNER JOIN users u ON u.id = s.user_id
                WHERE s.refresh_token_hash = ? AND s.revoked_at IS NULL AND s.expires_at > CURRENT_TIMESTAMP(3)
                LIMIT 1 FOR UPDATE
            `, [refreshTokenHash(refreshToken)]);
// Constante ou estado local: `current` mantém o dado necessário ao fluxo abaixo.
            const current = rows[0];
// Condição: altera o caminho de execução somente quando a regra indicada é verdadeira.
            if (!current || current.status !== 'ATIVO') {
                throw new HttpError(401, 'UNAUTHORIZED', 'Não autorizado.');
            }
// Consulta SQL: acessa ou altera registros no banco conforme parâmetros e condições desta instrução.
            await connection.query('UPDATE auth_sessions SET revoked_at = CURRENT_TIMESTAMP(3), last_used_at = CURRENT_TIMESTAMP(3) WHERE id = ?', [current.session_id]);
// Constante ou estado local: `session` mantém o dado necessário ao fluxo abaixo.
            const session = await createRefreshSession(connection, current.user_id);
            await connection.commit();
            return createAuthenticationResult(toPublicUser(current), session);
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    }

    public async authenticatedUser(payload: AccessTokenPayload): Promise<PublicUser | undefined> {
        const [rows] = await this.database.query<UserRow[]>(`
            SELECT u.id, u.nome, u.email, u.status, u.ultimo_login, u.created_at, u.updated_at
            FROM auth_sessions s
            INNER JOIN users u ON u.id = s.user_id
            WHERE s.id = ? AND s.user_id = ? AND s.revoked_at IS NULL AND s.expires_at > CURRENT_TIMESTAMP(3)
            LIMIT 1
        `, [payload.sessionId, payload.userId]);
// Constante ou estado local: `user` mantém o dado necessário ao fluxo abaixo.
        const user = rows[0];
        return user?.status === 'ATIVO' ? toPublicUser(user) : undefined;
    }

    public async revokeBySessionId(sessionId: string): Promise<void> {
        await this.database.query('UPDATE auth_sessions SET revoked_at = COALESCE(revoked_at, CURRENT_TIMESTAMP(3)) WHERE id = ?', [sessionId]);
    }

    public async revokeByRefreshToken(refreshToken: string): Promise<void> {
        await this.database.query(
            'UPDATE auth_sessions SET revoked_at = COALESCE(revoked_at, CURRENT_TIMESTAMP(3)) WHERE refresh_token_hash = ?',
            [refreshTokenHash(refreshToken)],
        );
    }
}

// Exportação principal: `authService` disponibiliza esta responsabilidade para os consumidores deste módulo.
export const authService = new AuthService();
