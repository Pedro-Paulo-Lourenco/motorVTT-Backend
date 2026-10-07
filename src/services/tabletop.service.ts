import { randomUUID } from 'node:crypto';

import {
    MessageType,
    ParticipantRole,
    RoomStatus,
    boardSchema,
    messageLogSchema,
    type JsonObject,
    type JsonValue,
    sceneSchema,
    tokenSchema,
    type MessageLog,
    type ParticipantRole as ParticipantRoleValue,
} from '@motor-vtt/contracts';
import { z } from 'zod';
import type { Pool, PoolConnection, RowDataPacket } from 'mysql2/promise';

import { env } from '../config/env.js';
import pool from '../config/database.js';
import { HttpError } from '../http/errors.js';
import type { DiceRollResult } from './dice-roller.js';

type Queryable = Pool | PoolConnection;
const MAX_RECENT_MESSAGES = 50;
export const tokenCreateSchema = tokenSchema.omit({ id: true, cenaId: true }).strict();
type TokenCreateInput = z.infer<typeof tokenCreateSchema>;
type BoardData = z.infer<typeof boardSchema>;
type SceneData = z.infer<typeof sceneSchema>;
export type TabletopToken = z.infer<typeof tokenSchema>;

type BoardRow = RowDataPacket & {
    id: string;
    sala_id: string;
    nome: string;
    cena_ativa_id: string | null;
    created_at: Date;
    updated_at: Date;
};

type SceneRow = RowDataPacket & {
    id: string;
    tabuleiro_id: string;
    nome: string;
    background_url: string | null;
    grid_config: unknown;
    visivel: boolean | number;
    created_at: Date;
    updated_at: Date;
};

type TokenRow = RowDataPacket & {
    id: string;
    cena_id: string;
    asset_origem_id: string | null;
    character_sheet_id: string | null;
    nome: string;
    x: number;
    y: number;
    escala: number;
    status_bar_map: unknown;
    custom_data: unknown;
};

type MessageRow = RowDataPacket & {
    id: string;
    sala_id: string;
    autor_id: string;
    tipo: MessageLog['tipo'];
    conteudo: string;
    secreto: boolean | number;
    metadata: unknown;
    created_at: Date;
};

export interface TabletopState {
    v: 1;
    roomId: string;
    board: BoardData;
    scene: SceneData;
    tokens: TabletopToken[];
}

export interface RoomMembership {
    userId: string;
    role: ParticipantRoleValue;
}

function asIso(value: Date): string {
    return value.toISOString();
}

function parseJson(value: unknown): unknown {
    return typeof value === 'string' ? JSON.parse(value) as unknown : value;
}

function toJsonValue(value: unknown): JsonValue {
    if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (Array.isArray(value)) return value.map(toJsonValue);
    if (typeof value === 'object') {
        return Object.fromEntries(
            Object.entries(value).map(([key, child]) => [key, toJsonValue(child)]),
        );
    }
    throw new Error('Metadata de mensagem não é JSON válido.');
}

function toJsonObject(value: unknown): JsonObject {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        throw new Error('Metadata de mensagem deve ser um objeto JSON.');
    }
    return Object.fromEntries(
        Object.entries(value).map(([key, child]) => [key, toJsonValue(child)]),
    );
}

function toMessageLog(value: unknown): MessageLog {
    const parsed = messageLogSchema.parse(value);
    const metadata = parsed.metadata === undefined ? undefined : toJsonObject(parsed.metadata);
    return {
        id: parsed.id,
        salaId: parsed.salaId,
        autorId: parsed.autorId,
        tipo: parsed.tipo,
        conteudo: parsed.conteudo,
        secreto: parsed.secreto,
        ...(metadata === undefined ? {} : { metadata }),
        createdAt: parsed.createdAt,
    };
}

function toBoard(row: BoardRow): BoardData {
    return boardSchema.parse({
        id: row.id,
        salaId: row.sala_id,
        nome: row.nome,
        cenaAtivaId: row.cena_ativa_id,
        createdAt: asIso(row.created_at),
        updatedAt: asIso(row.updated_at),
    });
}

function toScene(row: SceneRow): SceneData {
    return sceneSchema.parse({
        id: row.id,
        tabuleiroId: row.tabuleiro_id,
        nome: row.nome,
        backgroundUrl: row.background_url,
        gridConfig: parseJson(row.grid_config),
        visivel: Boolean(row.visivel),
        createdAt: asIso(row.created_at),
        updatedAt: asIso(row.updated_at),
    });
}

function toToken(row: TokenRow): TabletopToken {
    const customData = parseJson(row.custom_data);
    return tokenSchema.parse({
        id: row.id,
        cenaId: row.cena_id,
        assetOrigemId: row.asset_origem_id,
        characterSheetId: row.character_sheet_id,
        nome: row.nome,
        x: Number(row.x),
        y: Number(row.y),
        escala: Number(row.escala),
        statusBarMap: parseJson(row.status_bar_map),
        ...(customData === null || customData === undefined ? {} : { customData }),
    });
}

export class TabletopService {
    public constructor(private readonly database: Pool = pool) {}

    public async getRoomMembership(roomId: string, userId: string): Promise<RoomMembership> {
        const [rows] = await this.database.query<Array<RowDataPacket & { papel: ParticipantRoleValue }>>(
            `SELECT p.papel
             FROM rooms r
             INNER JOIN participants p ON p.sala_id = r.id
             WHERE r.id = ? AND r.status = ? AND p.usuario_id = ? AND p.ativo = TRUE
             LIMIT 1`,
            [roomId, RoomStatus.ATIVA, userId],
        );
        const participant = rows[0];
        if (!participant) {
            throw new HttpError(404, 'ROOM_NOT_FOUND', 'Sala não encontrada.');
        }
        return { userId, role: participant.papel };
    }

    public async getRecentMessages(roomId: string, userId: string): Promise<MessageLog[]> {
        await this.getRoomMembership(roomId, userId);
        const [rows] = await this.database.query<MessageRow[]>(
            `SELECT id, sala_id, autor_id, tipo, conteudo, secreto, metadata, created_at
             FROM message_logs
             WHERE sala_id = ?
             ORDER BY created_at DESC, id DESC
             LIMIT ${MAX_RECENT_MESSAGES}`,
            [roomId],
        );
        return rows.reverse().map((row) => toMessageLog({
            id: row.id,
            salaId: row.sala_id,
            autorId: row.autor_id,
            tipo: row.tipo,
            conteudo: row.conteudo,
            secreto: Boolean(row.secreto),
            ...(row.metadata === null ? {} : { metadata: parseJson(row.metadata) }),
            createdAt: asIso(row.created_at),
        }));
    }

    public async createMessage(
        roomId: string,
        userId: string,
        content: string,
        roll?: DiceRollResult,
    ): Promise<MessageLog> {
        await this.getRoomMembership(roomId, userId);
        const message = toMessageLog({
            id: randomUUID(),
            salaId: roomId,
            autorId: userId,
            tipo: roll === undefined ? MessageType.CHAT : MessageType.ROLAGEM,
            conteudo: content,
            secreto: false,
            ...(roll === undefined ? {} : { metadata: { roll } }),
            createdAt: new Date().toISOString(),
        });
        await this.database.query(
            `INSERT INTO message_logs
                (id, sala_id, autor_id, tipo, conteudo, secreto, metadata)
             VALUES (?, ?, ?, ?, ?, FALSE, ?)`,
            [
                message.id,
                message.salaId,
                message.autorId,
                message.tipo,
                message.conteudo,
                message.metadata === undefined ? null : JSON.stringify(message.metadata),
            ],
        );
        return message;
    }

    public async getInitialState(roomId: string, userId: string): Promise<TabletopState> {
        await this.getRoomMembership(roomId, userId);
        await this.ensureDefaultScene(roomId);

        const [boardRows] = await this.database.query<BoardRow[]>(
            `SELECT id, sala_id, nome, cena_ativa_id, created_at, updated_at
             FROM boards WHERE sala_id = ? AND cena_ativa_id IS NOT NULL
             ORDER BY created_at ASC LIMIT 1`,
            [roomId],
        );
        const boardRow = boardRows[0];
        if (!boardRow?.cena_ativa_id) {
            throw new Error('A cena inicial da sala não está disponível.');
        }

        const [sceneRows] = await this.database.query<SceneRow[]>(
            `SELECT id, tabuleiro_id, nome, background_url, grid_config, visivel, created_at, updated_at
             FROM scenes WHERE id = ? LIMIT 1`,
            [boardRow.cena_ativa_id],
        );
        const sceneRow = sceneRows[0];
        if (!sceneRow) throw new Error('A cena inicial da sala não está disponível.');

        const [tokenRows] = await this.database.query<TokenRow[]>(
            `SELECT id, cena_id, asset_origem_id, character_sheet_id, nome, x, y, escala,
                    status_bar_map, custom_data
             FROM tokens WHERE cena_id = ? ORDER BY id ASC`,
            [sceneRow.id],
        );

        return {
            v: 1,
            roomId,
            board: toBoard(boardRow),
            scene: toScene(sceneRow),
            tokens: tokenRows.map(toToken),
        };
    }

    public async addToken(roomId: string, userId: string, input: TokenCreateInput): Promise<TabletopToken> {
        await this.getRoomMembership(roomId, userId);
        await this.ensureDefaultScene(roomId);

        const connection = await this.database.getConnection();
        try {
            await connection.beginTransaction();
            const sceneId = await this.requireMasterAndActiveScene(connection, roomId, userId);
            const token = tokenSchema.parse({
                id: randomUUID(),
                cenaId: sceneId,
                ...input,
            });
            await connection.query(
                `INSERT INTO tokens
                    (id, cena_id, asset_origem_id, character_sheet_id, nome, x, y, escala, status_bar_map, custom_data)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    token.id,
                    token.cenaId,
                    token.assetOrigemId ?? null,
                    token.characterSheetId ?? null,
                    token.nome,
                    token.x,
                    token.y,
                    token.escala,
                    token.statusBarMap == null ? null : JSON.stringify(token.statusBarMap),
                    token.customData === undefined ? null : JSON.stringify(token.customData),
                ],
            );
            await connection.commit();
            return token;
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    }

    public async moveToken(
        roomId: string,
        userId: string,
        tokenId: string,
        x: number,
        y: number,
    ): Promise<TabletopToken> {
        await this.getRoomMembership(roomId, userId);
        const connection = await this.database.getConnection();
        try {
            await connection.beginTransaction();
            const sceneId = await this.requireMasterAndActiveScene(connection, roomId, userId);
            const token = await this.getTokenInScene(connection, sceneId, tokenId, true);
            await connection.query('UPDATE tokens SET x = ?, y = ? WHERE id = ?', [x, y, tokenId]);
            await connection.commit();
            return tokenSchema.parse({ ...token, x, y });
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    }

    public async removeToken(
        roomId: string,
        userId: string,
        tokenId: string,
    ): Promise<{ id: string; sceneId: string }> {
        await this.getRoomMembership(roomId, userId);
        const connection = await this.database.getConnection();
        try {
            await connection.beginTransaction();
            const sceneId = await this.requireMasterAndActiveScene(connection, roomId, userId);
            await this.getTokenInScene(connection, sceneId, tokenId, true);
            await connection.query('DELETE FROM tokens WHERE id = ?', [tokenId]);
            await connection.commit();
            return { id: tokenId, sceneId };
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    }

    private async ensureDefaultScene(roomId: string): Promise<void> {
        const connection = await this.database.getConnection();
        try {
            await connection.beginTransaction();
            const [roomRows] = await connection.query<Array<RowDataPacket & { id: string }>>(
                'SELECT id FROM rooms WHERE id = ? AND status = ? LIMIT 1 FOR UPDATE',
                [roomId, RoomStatus.ATIVA],
            );
            if (!roomRows[0]) throw new HttpError(404, 'ROOM_NOT_FOUND', 'Sala não encontrada.');

            const [boardRows] = await connection.query<BoardRow[]>(
                `SELECT id, sala_id, nome, cena_ativa_id, created_at, updated_at
                 FROM boards WHERE sala_id = ? ORDER BY created_at ASC LIMIT 1`,
                [roomId],
            );
            let board = boardRows[0];
            if (!board) {
                const boardId = randomUUID();
                await connection.query(
                    'INSERT INTO boards (id, sala_id, nome, cena_ativa_id) VALUES (?, ?, ?, NULL)',
                    [boardId, roomId, 'Tabuleiro principal'],
                );
                const [createdBoards] = await connection.query<BoardRow[]>(
                    `SELECT id, sala_id, nome, cena_ativa_id, created_at, updated_at
                     FROM boards WHERE id = ? LIMIT 1`,
                    [boardId],
                );
                board = createdBoards[0];
            }
            if (!board) throw new Error('Não foi possível preparar o tabuleiro inicial.');

            if (board.cena_ativa_id === null) {
                const sceneId = randomUUID();
                await connection.query(
                    `INSERT INTO scenes (id, tabuleiro_id, nome, background_url, grid_config, visivel)
                     VALUES (?, ?, ?, ?, ?, TRUE)`,
                    [
                        sceneId,
                        board.id,
                        'Cena principal',
                        env.TABLETOP_BACKGROUND_URL ?? null,
                        JSON.stringify({ enabled: true, size: env.TABLETOP_GRID_SIZE, opacity: 0.5 }),
                    ],
                );
                await connection.query('UPDATE boards SET cena_ativa_id = ? WHERE id = ?', [sceneId, board.id]);
            }
            await connection.commit();
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    }

    private async requireMasterAndActiveScene(
        connection: PoolConnection,
        roomId: string,
        userId: string,
    ): Promise<string> {
        const [rows] = await connection.query<Array<RowDataPacket & {
            scene_id: string | null;
            papel: ParticipantRoleValue;
        }>>(
            `SELECT b.cena_ativa_id AS scene_id, p.papel
             FROM rooms r
             INNER JOIN participants p ON p.sala_id = r.id
             INNER JOIN boards b ON b.sala_id = r.id AND b.cena_ativa_id IS NOT NULL
             WHERE r.id = ? AND r.status = ? AND p.usuario_id = ? AND p.ativo = TRUE
             ORDER BY b.created_at ASC LIMIT 1 FOR UPDATE`,
            [roomId, RoomStatus.ATIVA, userId],
        );
        const membership = rows[0];
        if (!membership) throw new HttpError(404, 'ROOM_NOT_FOUND', 'Sala não encontrada.');
        if (membership.papel !== ParticipantRole.MESTRE) {
            throw new HttpError(403, 'MASTER_REQUIRED', 'Somente o mestre pode alterar tokens.');
        }
        if (!membership.scene_id) throw new Error('A cena ativa da sala não está disponível.');
        return membership.scene_id;
    }

    private async getTokenInScene(
        connection: Queryable,
        sceneId: string,
        tokenId: string,
        lock: boolean,
    ): Promise<TabletopToken> {
        const [rows] = await connection.query<TokenRow[]>(
            `SELECT id, cena_id, asset_origem_id, character_sheet_id, nome, x, y, escala,
                    status_bar_map, custom_data
             FROM tokens WHERE id = ? AND cena_id = ? LIMIT 1${lock ? ' FOR UPDATE' : ''}`,
            [tokenId, sceneId],
        );
        const row = rows[0];
        if (!row) throw new HttpError(404, 'TOKEN_NOT_FOUND', 'Token não encontrado.');
        return toToken(row);
    }
}

export const tabletopService = new TabletopService();
