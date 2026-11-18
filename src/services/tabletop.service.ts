/** Persiste snapshots, mensagens e mutações do estado tabletop. */
// Importações: reúnem bibliotecas, tipos e módulos locais usados pelos blocos seguintes.
import { randomUUID } from 'node:crypto';

import {
    MessageType,
    ParticipantRole,
    RoomStatus,
    boardSchema,
    messageLogSchema,
// Tipo: `JsonObject` descreve o formato estruturado usado nas operações relacionadas.
    type JsonObject,
// Tipo: `JsonValue` descreve o formato estruturado usado nas operações relacionadas.
    type JsonValue,
    sceneSchema,
    tokenSchema,
// Tipo: `MessageLog` descreve o formato estruturado usado nas operações relacionadas.
    type MessageLog,
// Tipo: `ParticipantRole` descreve o formato estruturado usado nas operações relacionadas.
    type ParticipantRole as ParticipantRoleValue,
} from '@motor-vtt/contracts';
import { z } from 'zod';
import type { Pool, PoolConnection, RowDataPacket } from 'mysql2/promise';

import { env } from '../config/env.js';
import pool from '../config/database.js';
import { HttpError } from '../http/errors.js';
import type { DiceRollResult } from './dice-roller.js';

// Tipo: `Queryable` descreve o formato estruturado usado nas operações relacionadas.
type Queryable = Pool | PoolConnection;
// Constante ou estado local: `MAX_RECENT_MESSAGES` mantém o dado necessário ao fluxo abaixo.
const MAX_RECENT_MESSAGES = 50;
// Exportação principal: `tokenCreateSchema` disponibiliza esta responsabilidade para os consumidores deste módulo.
export const tokenCreateSchema = tokenSchema.omit({ id: true, cenaId: true }).strict();
// Tipo: `TokenCreateInput` descreve o formato estruturado usado nas operações relacionadas.
type TokenCreateInput = z.infer<typeof tokenCreateSchema>;
// Tipo: `BoardData` descreve o formato estruturado usado nas operações relacionadas.
type BoardData = z.infer<typeof boardSchema>;
// Tipo: `SceneData` descreve o formato estruturado usado nas operações relacionadas.
type SceneData = z.infer<typeof sceneSchema>;
// Exportação principal: `TabletopToken` disponibiliza esta responsabilidade para os consumidores deste módulo.
export type TabletopToken = z.infer<typeof tokenSchema>;

// Tipo: `BoardRow` descreve o formato estruturado usado nas operações relacionadas.
type BoardRow = RowDataPacket & {
    id: string;
    sala_id: string;
    nome: string;
    cena_ativa_id: string | null;
    created_at: Date;
    updated_at: Date;
};

// Tipo: `SceneRow` descreve o formato estruturado usado nas operações relacionadas.
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

// Tipo: `TokenRow` descreve o formato estruturado usado nas operações relacionadas.
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

// Tipo: `MessageRow` descreve o formato estruturado usado nas operações relacionadas.
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

// Exportação principal: `TabletopState` disponibiliza esta responsabilidade para os consumidores deste módulo.
export interface TabletopState {
    v: 1;
    roomId: string;
    board: BoardData;
    scene: SceneData;
    tokens: TabletopToken[];
}

// Exportação principal: `RoomMembership` disponibiliza esta responsabilidade para os consumidores deste módulo.
export interface RoomMembership {
    userId: string;
    role: ParticipantRoleValue;
}

// Bloco local: `asIso` concentra uma responsabilidade reutilizada dentro deste módulo.
function asIso(value: Date): string {
    return value.toISOString();
}

// Bloco local: `parseJson` concentra uma responsabilidade reutilizada dentro deste módulo.
function parseJson(value: unknown): unknown {
    return typeof value === 'string' ? JSON.parse(value) as unknown : value;
}

// Bloco local: `toJsonValue` concentra uma responsabilidade reutilizada dentro deste módulo.
function toJsonValue(value: unknown): JsonValue {
// Condição: altera o caminho de execução somente quando a regra indicada é verdadeira.
    if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
// Condição: altera o caminho de execução somente quando a regra indicada é verdadeira.
    if (typeof value === 'number' && Number.isFinite(value)) return value;
// Condição: altera o caminho de execução somente quando a regra indicada é verdadeira.
    if (Array.isArray(value)) return value.map(toJsonValue);
// Condição: altera o caminho de execução somente quando a regra indicada é verdadeira.
    if (typeof value === 'object') {
        return Object.fromEntries(
            Object.entries(value).map(([key, child]) => [key, toJsonValue(child)]),
        );
    }
    throw new Error('Metadata de mensagem não é JSON válido.');
}

// Bloco local: `toJsonObject` concentra uma responsabilidade reutilizada dentro deste módulo.
function toJsonObject(value: unknown): JsonObject {
// Condição: altera o caminho de execução somente quando a regra indicada é verdadeira.
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        throw new Error('Metadata de mensagem deve ser um objeto JSON.');
    }
    return Object.fromEntries(
        Object.entries(value).map(([key, child]) => [key, toJsonValue(child)]),
    );
}

// Bloco local: `toMessageLog` concentra uma responsabilidade reutilizada dentro deste módulo.
function toMessageLog(value: unknown): MessageLog {
// Constante ou estado local: `parsed` mantém o dado necessário ao fluxo abaixo.
    const parsed = messageLogSchema.parse(value);
// Constante ou estado local: `metadata` mantém o dado necessário ao fluxo abaixo.
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

// Bloco local: `toBoard` concentra uma responsabilidade reutilizada dentro deste módulo.
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

// Bloco local: `toScene` concentra uma responsabilidade reutilizada dentro deste módulo.
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

// Bloco local: `toToken` concentra uma responsabilidade reutilizada dentro deste módulo.
function toToken(row: TokenRow): TabletopToken {
// Constante ou estado local: `customData` mantém o dado necessário ao fluxo abaixo.
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

// Exportação principal: `TabletopService` disponibiliza esta responsabilidade para os consumidores deste módulo.
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
// Constante ou estado local: `participant` mantém o dado necessário ao fluxo abaixo.
        const participant = rows[0];
// Condição: altera o caminho de execução somente quando a regra indicada é verdadeira.
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
// Constante ou estado local: `message` mantém o dado necessário ao fluxo abaixo.
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
// Constante ou estado local: `boardRow` mantém o dado necessário ao fluxo abaixo.
        const boardRow = boardRows[0];
// Condição: altera o caminho de execução somente quando a regra indicada é verdadeira.
        if (!boardRow?.cena_ativa_id) {
            throw new Error('A cena inicial da sala não está disponível.');
        }

        const [sceneRows] = await this.database.query<SceneRow[]>(
            `SELECT id, tabuleiro_id, nome, background_url, grid_config, visivel, created_at, updated_at
             FROM scenes WHERE id = ? LIMIT 1`,
            [boardRow.cena_ativa_id],
        );
// Constante ou estado local: `sceneRow` mantém o dado necessário ao fluxo abaixo.
        const sceneRow = sceneRows[0];
// Condição: altera o caminho de execução somente quando a regra indicada é verdadeira.
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

// Constante ou estado local: `connection` mantém o dado necessário ao fluxo abaixo.
        const connection = await this.database.getConnection();
// Bloco protegido: mantém o fluxo principal e suas finalizações ou tratamentos associados.
        try {
            await connection.beginTransaction();
// Constante ou estado local: `sceneId` mantém o dado necessário ao fluxo abaixo.
            const sceneId = await this.requireMasterAndActiveScene(connection, roomId, userId);
// Constante ou estado local: `token` mantém o dado necessário ao fluxo abaixo.
            const token = tokenSchema.parse({
                id: randomUUID(),
                cenaId: sceneId,
                ...input,
            });
// Consulta SQL: acessa ou altera registros no banco conforme parâmetros e condições desta instrução.
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
// Constante ou estado local: `connection` mantém o dado necessário ao fluxo abaixo.
        const connection = await this.database.getConnection();
// Bloco protegido: mantém o fluxo principal e suas finalizações ou tratamentos associados.
        try {
            await connection.beginTransaction();
// Constante ou estado local: `sceneId` mantém o dado necessário ao fluxo abaixo.
            const sceneId = await this.requireMasterAndActiveScene(connection, roomId, userId);
// Constante ou estado local: `token` mantém o dado necessário ao fluxo abaixo.
            const token = await this.getTokenInScene(connection, sceneId, tokenId, true);
// Consulta SQL: acessa ou altera registros no banco conforme parâmetros e condições desta instrução.
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
// Constante ou estado local: `connection` mantém o dado necessário ao fluxo abaixo.
        const connection = await this.database.getConnection();
// Bloco protegido: mantém o fluxo principal e suas finalizações ou tratamentos associados.
        try {
            await connection.beginTransaction();
// Constante ou estado local: `sceneId` mantém o dado necessário ao fluxo abaixo.
            const sceneId = await this.requireMasterAndActiveScene(connection, roomId, userId);
            await this.getTokenInScene(connection, sceneId, tokenId, true);
// Consulta SQL: acessa ou altera registros no banco conforme parâmetros e condições desta instrução.
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
// Constante ou estado local: `connection` mantém o dado necessário ao fluxo abaixo.
        const connection = await this.database.getConnection();
// Bloco protegido: mantém o fluxo principal e suas finalizações ou tratamentos associados.
        try {
            await connection.beginTransaction();
// Consulta SQL: acessa ou altera registros no banco conforme parâmetros e condições desta instrução.
            const [roomRows] = await connection.query<Array<RowDataPacket & { id: string }>>(
                'SELECT id FROM rooms WHERE id = ? AND status = ? LIMIT 1 FOR UPDATE',
                [roomId, RoomStatus.ATIVA],
            );
// Condição: altera o caminho de execução somente quando a regra indicada é verdadeira.
            if (!roomRows[0]) throw new HttpError(404, 'ROOM_NOT_FOUND', 'Sala não encontrada.');

// Consulta SQL: acessa ou altera registros no banco conforme parâmetros e condições desta instrução.
            const [boardRows] = await connection.query<BoardRow[]>(
                `SELECT id, sala_id, nome, cena_ativa_id, created_at, updated_at
                 FROM boards WHERE sala_id = ? ORDER BY created_at ASC LIMIT 1`,
                [roomId],
            );
// Constante ou estado local: `board` mantém o dado necessário ao fluxo abaixo.
            let board = boardRows[0];
// Condição: altera o caminho de execução somente quando a regra indicada é verdadeira.
            if (!board) {
// Constante ou estado local: `boardId` mantém o dado necessário ao fluxo abaixo.
                const boardId = randomUUID();
// Consulta SQL: acessa ou altera registros no banco conforme parâmetros e condições desta instrução.
                await connection.query(
                    'INSERT INTO boards (id, sala_id, nome, cena_ativa_id) VALUES (?, ?, ?, NULL)',
                    [boardId, roomId, 'Tabuleiro principal'],
                );
// Consulta SQL: acessa ou altera registros no banco conforme parâmetros e condições desta instrução.
                const [createdBoards] = await connection.query<BoardRow[]>(
                    `SELECT id, sala_id, nome, cena_ativa_id, created_at, updated_at
                     FROM boards WHERE id = ? LIMIT 1`,
                    [boardId],
                );
                board = createdBoards[0];
            }
// Condição: altera o caminho de execução somente quando a regra indicada é verdadeira.
            if (!board) throw new Error('Não foi possível preparar o tabuleiro inicial.');

// Condição: altera o caminho de execução somente quando a regra indicada é verdadeira.
            if (board.cena_ativa_id === null) {
// Constante ou estado local: `sceneId` mantém o dado necessário ao fluxo abaixo.
                const sceneId = randomUUID();
// Consulta SQL: acessa ou altera registros no banco conforme parâmetros e condições desta instrução.
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
// Consulta SQL: acessa ou altera registros no banco conforme parâmetros e condições desta instrução.
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
// Consulta SQL: acessa ou altera registros no banco conforme parâmetros e condições desta instrução.
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
// Constante ou estado local: `membership` mantém o dado necessário ao fluxo abaixo.
        const membership = rows[0];
// Condição: altera o caminho de execução somente quando a regra indicada é verdadeira.
        if (!membership) throw new HttpError(404, 'ROOM_NOT_FOUND', 'Sala não encontrada.');
// Condição: altera o caminho de execução somente quando a regra indicada é verdadeira.
        if (membership.papel !== ParticipantRole.MESTRE) {
            throw new HttpError(403, 'MASTER_REQUIRED', 'Somente o mestre pode alterar tokens.');
        }
// Condição: altera o caminho de execução somente quando a regra indicada é verdadeira.
        if (!membership.scene_id) throw new Error('A cena ativa da sala não está disponível.');
        return membership.scene_id;
    }

    private async getTokenInScene(
        connection: Queryable,
        sceneId: string,
        tokenId: string,
        lock: boolean,
    ): Promise<TabletopToken> {
// Consulta SQL: acessa ou altera registros no banco conforme parâmetros e condições desta instrução.
        const [rows] = await connection.query<TokenRow[]>(
            `SELECT id, cena_id, asset_origem_id, character_sheet_id, nome, x, y, escala,
                    status_bar_map, custom_data
             FROM tokens WHERE id = ? AND cena_id = ? LIMIT 1${lock ? ' FOR UPDATE' : ''}`,
            [tokenId, sceneId],
        );
// Constante ou estado local: `row` mantém o dado necessário ao fluxo abaixo.
        const row = rows[0];
// Condição: altera o caminho de execução somente quando a regra indicada é verdadeira.
        if (!row) throw new HttpError(404, 'TOKEN_NOT_FOUND', 'Token não encontrado.');
        return toToken(row);
    }
}

// Exportação principal: `tabletopService` disponibiliza esta responsabilidade para os consumidores deste módulo.
export const tabletopService = new TabletopService();
