/** Implementa hashing, emissão, rotação e revogação das credenciais. */
// Dependências deste módulo: cada importação fornece recursos, tipos ou integrações usados na implementação abaixo.
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

// Contrato de dados: `Queryable` documenta o formato e o significado dos dados trocados entre as camadas relacionadas.
type Queryable = Pool | PoolConnection;

// Contrato de dados: `UserRow` documenta o formato e o significado dos dados trocados entre as camadas relacionadas.
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

// Contrato de dados: `SessionRow` documenta o formato e o significado dos dados trocados entre as camadas relacionadas.
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

// API pública do módulo: `AccessTokenPayload` define a interface pública consumida pelos demais módulos.
export type AccessTokenPayload = {
    userId: string;
    sessionId: string;
};

// API pública do módulo: `VerifiedAccessTokenPayload` define a interface pública consumida pelos demais módulos.
export type VerifiedAccessTokenPayload = AccessTokenPayload & { expiresAt: number };

// Estado intermediário: `BCRYPT_COST` guarda o valor que será validado, transformado ou persistido nas etapas seguintes.
const BCRYPT_COST = 12;

// Mantém o custo computacional de tentativas com e-mail inexistente semelhante ao de e-mails válidos, reduzindo enumeração por tempo de resposta.
// Estado intermediário: `DUMMY_PASSWORD_HASH` guarda o valor que será validado, transformado ou persistido nas etapas seguintes.
const DUMMY_PASSWORD_HASH = '$2b$12$2E6ERKF9l/grbZlE6CzadOvPFfr3AbA/4YfCEqWhj6UKNZ6LD2j3K';

// Função auxiliar: `hashPassword` isola uma responsabilidade reutilizada neste módulo.
async function hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, BCRYPT_COST);
}

// Função auxiliar: `verifyPassword` isola uma responsabilidade reutilizada neste módulo.
async function verifyPassword(hash: string, password: string): Promise<boolean> {
// Tratamento protegido: garante que o recurso seja finalizado e que erros sigam para o fluxo central de tratamento.
    try {
        return await bcrypt.compare(password, hash);
    } catch {
        return false;
    }
}

// Função auxiliar: `asIso` isola uma responsabilidade reutilizada neste módulo.
function asIso(value: Date): string {
    return value.toISOString();
}

// Função auxiliar: `toPublicUser` isola uma responsabilidade reutilizada neste módulo.
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

// Função auxiliar: `durationToMilliseconds` isola uma responsabilidade reutilizada neste módulo.
function durationToMilliseconds(value: string): number {
// Estado intermediário: `match` guarda o valor que será validado, transformado ou persistido nas etapas seguintes.
    const match = /^(\d+)([smhd])$/.exec(value);
// Regra de negócio: a validação abaixo decide se o fluxo pode continuar ou deve retornar antecipadamente.
    if (!match) throw new Error('Duração de token inválida.');
// Estado intermediário: `amount` guarda o valor que será validado, transformado ou persistido nas etapas seguintes.
    const amount = Number(match[1]);
// Estado intermediário: `unit` guarda o valor que será validado, transformado ou persistido nas etapas seguintes.
    const unit = match[2];
// Estado intermediário: `multiplier` guarda o valor que será validado, transformado ou persistido nas etapas seguintes.
    const multiplier = unit === 's' ? 1_000 : unit === 'm' ? 60_000 : unit === 'h' ? 3_600_000 : 86_400_000;
    return amount * multiplier;
}

// Função auxiliar: `refreshTokenHash` isola uma responsabilidade reutilizada neste módulo.
function refreshTokenHash(token: string): string {
    return createHash('sha256').update(token).digest('hex');
}

// Função auxiliar: `isDuplicateKey` isola uma responsabilidade reutilizada neste módulo.
function isDuplicateKey(error: unknown): boolean {
    return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ER_DUP_ENTRY';
}

// Função auxiliar: `findUserByEmail` isola uma responsabilidade reutilizada neste módulo.
async function findUserByEmail(connection: Queryable, email: string): Promise<UserRow | undefined> {
// Persistência: esta consulta lê ou altera os registros necessários para manter o estado da aplicação consistente.
    const [rows] = await connection.query<UserRow[]>(`
        SELECT u.id, u.nome, u.email, u.status, u.ultimo_login, u.created_at, u.updated_at, c.password_hash
        FROM users u
        LEFT JOIN user_credentials c ON c.user_id = u.id
        WHERE u.email = ?
        LIMIT 1
    `, [email]);
    return rows[0];
}

// Função auxiliar: `findUserById` isola uma responsabilidade reutilizada neste módulo.
async function findUserById(connection: Queryable, id: string): Promise<UserRow | undefined> {
// Persistência: esta consulta lê ou altera os registros necessários para manter o estado da aplicação consistente.
    const [rows] = await connection.query<UserRow[]>(`
        SELECT u.id, u.nome, u.email, u.status, u.ultimo_login, u.created_at, u.updated_at
        FROM users u
        WHERE u.id = ?
        LIMIT 1
    `, [id]);
    return rows[0];
}

// Função auxiliar: `createRefreshSession` isola uma responsabilidade reutilizada neste módulo.
async function createRefreshSession(connection: Queryable, userId: string): Promise<RefreshSession> {
// Estado intermediário: `refreshToken` guarda o valor que será validado, transformado ou persistido nas etapas seguintes.
    const refreshToken = randomBytes(48).toString('base64url');
// Estado intermediário: `expiresAt` guarda o valor que será validado, transformado ou persistido nas etapas seguintes.
    const expiresAt = new Date(Date.now() + durationToMilliseconds(env.REFRESH_TOKEN_EXPIRES_IN));
    const session: RefreshSession = {
        id: randomUUID(),
        userId,
        refreshToken,
        expiresAt,
    };

// Persistência: esta consulta lê ou altera os registros necessários para manter o estado da aplicação consistente.
    await connection.query(
        'INSERT INTO auth_sessions (id, user_id, refresh_token_hash, expires_at) VALUES (?, ?, ?, ?)',
        [session.id, session.userId, refreshTokenHash(session.refreshToken), session.expiresAt],
    );
    return session;
}

// Função auxiliar: `createAuthenticationResult` isola uma responsabilidade reutilizada neste módulo.
function createAuthenticationResult(user: PublicUser, session: RefreshSession): {
    response: AuthServiceResponse;
    session: RefreshSession;
} {
// Estado intermediário: `accessTokenExpiresAt` guarda o valor que será validado, transformado ou persistido nas etapas seguintes.
    const accessTokenExpiresAt = new Date(Date.now() + durationToMilliseconds(env.JWT_EXPIRES_IN));
    const options: SignOptions = {
        algorithm: 'HS256',
        subject: user.id,
        issuer: 'motor-vtt',
        audience: 'motor-vtt-api',
        expiresIn: env.JWT_EXPIRES_IN as NonNullable<SignOptions['expiresIn']>,
    };
// Estado intermediário: `accessToken` guarda o valor que será validado, transformado ou persistido nas etapas seguintes.
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

// API pública do módulo: `accessTokenLifetimeMilliseconds` define a interface pública consumida pelos demais módulos.
export function accessTokenLifetimeMilliseconds(): number {
    return durationToMilliseconds(env.JWT_EXPIRES_IN);
}

// API pública do módulo: `refreshTokenLifetimeMilliseconds` define a interface pública consumida pelos demais módulos.
export function refreshTokenLifetimeMilliseconds(): number {
    return durationToMilliseconds(env.REFRESH_TOKEN_EXPIRES_IN);
}

// API pública do módulo: `verifyAccessToken` define a interface pública consumida pelos demais módulos.
export function verifyAccessToken(token: string): VerifiedAccessTokenPayload | undefined {
// Tratamento protegido: garante que o recurso seja finalizado e que erros sigam para o fluxo central de tratamento.
    try {
// Estado intermediário: `decoded` guarda o valor que será validado, transformado ou persistido nas etapas seguintes.
        const decoded = jwt.verify(token, env.JWT_SECRET, {
            algorithms: ['HS256'],
            issuer: 'motor-vtt',
            audience: 'motor-vtt-api',
        });
// Regra de negócio: a validação abaixo decide se o fluxo pode continuar ou deve retornar antecipadamente.
        if (typeof decoded === 'string') return undefined;
// Estado intermediário: `payload` guarda o valor que será validado, transformado ou persistido nas etapas seguintes.
        const payload = decoded as JwtPayload;
// Regra de negócio: a validação abaixo decide se o fluxo pode continuar ou deve retornar antecipadamente.
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

// API pública do módulo: `AuthService` define a interface pública consumida pelos demais módulos.
export class AuthService {
    public constructor(private readonly database: Pool = pool) {}

    public async register(input: RegisterInput): Promise<{ response: AuthServiceResponse; session: RefreshSession }> {
// Estado intermediário: `passwordHash` guarda o valor que será validado, transformado ou persistido nas etapas seguintes.
        const passwordHash = await hashPassword(input.password);
// Estado intermediário: `connection` guarda o valor que será validado, transformado ou persistido nas etapas seguintes.
        const connection = await this.database.getConnection();
// Tratamento protegido: garante que o recurso seja finalizado e que erros sigam para o fluxo central de tratamento.
        try {
            await connection.beginTransaction();
// Estado intermediário: `userId` guarda o valor que será validado, transformado ou persistido nas etapas seguintes.
            const userId = randomUUID();

// Tratamento protegido: garante que o recurso seja finalizado e que erros sigam para o fluxo central de tratamento.
            try {
                // TODO(auth): switch this to PENDENTE when e-mail verification is implemented.
// Persistência: esta consulta lê ou altera os registros necessários para manter o estado da aplicação consistente.
                await connection.query(
                    `INSERT INTO users (id, nome, email, status, ultimo_login) VALUES (?, ?, ?, 'ATIVO', NULL)`,
                    [userId, input.nome, input.email],
                );
            } catch (error) {
// Regra de negócio: a validação abaixo decide se o fluxo pode continuar ou deve retornar antecipadamente.
                if (isDuplicateKey(error)) {
                    throw new HttpError(409, 'EMAIL_ALREADY_REGISTERED', 'Este e-mail já está cadastrado.');
                }
                throw error;
            }

// Persistência: esta consulta lê ou altera os registros necessários para manter o estado da aplicação consistente.
            await connection.query(
                'INSERT INTO user_credentials (user_id, password_hash) VALUES (?, ?)',
                [userId, passwordHash],
            );
// Estado intermediário: `user` guarda o valor que será validado, transformado ou persistido nas etapas seguintes.
            const user = await findUserById(connection, userId);
// Regra de negócio: a validação abaixo decide se o fluxo pode continuar ou deve retornar antecipadamente.
            if (!user) throw new Error('Usuário recém-criado não encontrado.');
// Estado intermediário: `session` guarda o valor que será validado, transformado ou persistido nas etapas seguintes.
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
// Estado intermediário: `candidate` guarda o valor que será validado, transformado ou persistido nas etapas seguintes.
        const candidate = await findUserByEmail(this.database, input.email);
// Estado intermediário: `passwordMatches` guarda o valor que será validado, transformado ou persistido nas etapas seguintes.
        const passwordMatches = candidate?.password_hash
            ? await verifyPassword(candidate.password_hash, input.password)
            : await bcrypt.compare(input.password, DUMMY_PASSWORD_HASH);

// Regra de negócio: a validação abaixo decide se o fluxo pode continuar ou deve retornar antecipadamente.
        if (!candidate || !candidate.password_hash || !passwordMatches) {
            throw new HttpError(401, 'CREDENTIALS_INVALID', 'Credenciais inválidas.');
        }
// Regra de negócio: a validação abaixo decide se o fluxo pode continuar ou deve retornar antecipadamente.
        if (candidate.status !== 'ATIVO') {
            throw new HttpError(403, 'ACCOUNT_INACTIVE', 'Esta conta não está ativa.');
        }

// Estado intermediário: `connection` guarda o valor que será validado, transformado ou persistido nas etapas seguintes.
        const connection = await this.database.getConnection();
// Tratamento protegido: garante que o recurso seja finalizado e que erros sigam para o fluxo central de tratamento.
        try {
            await connection.beginTransaction();
// Persistência: esta consulta lê ou altera os registros necessários para manter o estado da aplicação consistente.
            await connection.query<ResultSetHeader>('UPDATE users SET ultimo_login = CURRENT_TIMESTAMP(3) WHERE id = ?', [candidate.id]);
// Estado intermediário: `updatedUser` guarda o valor que será validado, transformado ou persistido nas etapas seguintes.
            const updatedUser = await findUserById(connection, candidate.id);
// Regra de negócio: a validação abaixo decide se o fluxo pode continuar ou deve retornar antecipadamente.
            if (!updatedUser) throw new Error('Usuário autenticado não encontrado.');
// Estado intermediário: `session` guarda o valor que será validado, transformado ou persistido nas etapas seguintes.
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
// Estado intermediário: `connection` guarda o valor que será validado, transformado ou persistido nas etapas seguintes.
        const connection = await this.database.getConnection();
// Tratamento protegido: garante que o recurso seja finalizado e que erros sigam para o fluxo central de tratamento.
        try {
            await connection.beginTransaction();
// Persistência: esta consulta lê ou altera os registros necessários para manter o estado da aplicação consistente.
            const [rows] = await connection.query<SessionRow[]>(`
                SELECT s.id AS session_id, s.user_id, s.refresh_token_hash, s.expires_at, s.revoked_at,
                    u.id, u.nome, u.email, u.status, u.ultimo_login, u.created_at, u.updated_at
                FROM auth_sessions s
                INNER JOIN users u ON u.id = s.user_id
                WHERE s.refresh_token_hash = ? AND s.revoked_at IS NULL AND s.expires_at > CURRENT_TIMESTAMP(3)
                LIMIT 1 FOR UPDATE
            `, [refreshTokenHash(refreshToken)]);
// Estado intermediário: `current` guarda o valor que será validado, transformado ou persistido nas etapas seguintes.
            const current = rows[0];
// Regra de negócio: a validação abaixo decide se o fluxo pode continuar ou deve retornar antecipadamente.
            if (!current || current.status !== 'ATIVO') {
                throw new HttpError(401, 'UNAUTHORIZED', 'Não autorizado.');
            }
// Persistência: esta consulta lê ou altera os registros necessários para manter o estado da aplicação consistente.
            await connection.query('UPDATE auth_sessions SET revoked_at = CURRENT_TIMESTAMP(3), last_used_at = CURRENT_TIMESTAMP(3) WHERE id = ?', [current.session_id]);
// Estado intermediário: `session` guarda o valor que será validado, transformado ou persistido nas etapas seguintes.
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
// Estado intermediário: `user` guarda o valor que será validado, transformado ou persistido nas etapas seguintes.
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

// API pública do módulo: `authService` define a interface pública consumida pelos demais módulos.
export const authService = new AuthService();
