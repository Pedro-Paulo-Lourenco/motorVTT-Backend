import { randomUUID } from 'node:crypto';
import { MessageType, ParticipantRole, RoomStatus, boardSchema, messageLogSchema, sceneSchema, tokenSchema, } from '@motor-vtt/contracts';
import { z } from 'zod';
import { env } from '../config/env.js';
import pool from '../config/database.js';
import { HttpError } from '../http/errors.js';
const MAX_RECENT_MESSAGES = 50;
export const tokenCreateSchema = tokenSchema.omit({ id: true, cenaId: true }).strict();
function asIso(value) {
    return value.toISOString();
}
function parseJson(value) {
    return typeof value === 'string' ? JSON.parse(value) : value;
}
function toJsonValue(value) {
    if (value === null || typeof value === 'string' || typeof value === 'boolean')
        return value;
    if (typeof value === 'number' && Number.isFinite(value))
        return value;
    if (Array.isArray(value))
        return value.map(toJsonValue);
    if (typeof value === 'object') {
        return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, toJsonValue(child)]));
    }
    throw new Error('Metadata de mensagem não é JSON válido.');
}
function toJsonObject(value) {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        throw new Error('Metadata de mensagem deve ser um objeto JSON.');
    }
    return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, toJsonValue(child)]));
}
function toMessageLog(value) {
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
function toBoard(row) {
    return boardSchema.parse({
        id: row.id,
        salaId: row.sala_id,
        nome: row.nome,
        cenaAtivaId: row.cena_ativa_id,
        createdAt: asIso(row.created_at),
        updatedAt: asIso(row.updated_at),
    });
}
function toScene(row) {
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
function toToken(row) {
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
    database;
    constructor(database = pool) {
        this.database = database;
    }
    async getRoomMembership(roomId, userId) {
        const [rows] = await this.database.query(`SELECT p.papel
             FROM rooms r
             INNER JOIN participants p ON p.sala_id = r.id
             WHERE r.id = ? AND r.status = ? AND p.usuario_id = ? AND p.ativo = TRUE
             LIMIT 1`, [roomId, RoomStatus.ATIVA, userId]);
        const participant = rows[0];
        if (!participant) {
            throw new HttpError(404, 'ROOM_NOT_FOUND', 'Sala não encontrada.');
        }
        return { userId, role: participant.papel };
    }
    async getRecentMessages(roomId, userId) {
        await this.getRoomMembership(roomId, userId);
        const [rows] = await this.database.query(`SELECT id, sala_id, autor_id, tipo, conteudo, secreto, metadata, created_at
             FROM message_logs
             WHERE sala_id = ?
             ORDER BY created_at DESC, id DESC
             LIMIT ${MAX_RECENT_MESSAGES}`, [roomId]);
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
    async createMessage(roomId, userId, content, roll) {
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
        await this.database.query(`INSERT INTO message_logs
                (id, sala_id, autor_id, tipo, conteudo, secreto, metadata)
             VALUES (?, ?, ?, ?, ?, FALSE, ?)`, [
            message.id,
            message.salaId,
            message.autorId,
            message.tipo,
            message.conteudo,
            message.metadata === undefined ? null : JSON.stringify(message.metadata),
        ]);
        return message;
    }
    async getInitialState(roomId, userId) {
        await this.getRoomMembership(roomId, userId);
        await this.ensureDefaultScene(roomId);
        const [boardRows] = await this.database.query(`SELECT id, sala_id, nome, cena_ativa_id, created_at, updated_at
             FROM boards WHERE sala_id = ? AND cena_ativa_id IS NOT NULL
             ORDER BY created_at ASC LIMIT 1`, [roomId]);
        const boardRow = boardRows[0];
        if (!boardRow?.cena_ativa_id) {
            throw new Error('A cena inicial da sala não está disponível.');
        }
        const [sceneRows] = await this.database.query(`SELECT id, tabuleiro_id, nome, background_url, grid_config, visivel, created_at, updated_at
             FROM scenes WHERE id = ? LIMIT 1`, [boardRow.cena_ativa_id]);
        const sceneRow = sceneRows[0];
        if (!sceneRow)
            throw new Error('A cena inicial da sala não está disponível.');
        const [tokenRows] = await this.database.query(`SELECT id, cena_id, asset_origem_id, character_sheet_id, nome, x, y, escala,
                    status_bar_map, custom_data
             FROM tokens WHERE cena_id = ? ORDER BY id ASC`, [sceneRow.id]);
        return {
            v: 1,
            roomId,
            board: toBoard(boardRow),
            scene: toScene(sceneRow),
            tokens: tokenRows.map(toToken),
        };
    }
    async addToken(roomId, userId, input) {
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
            await connection.query(`INSERT INTO tokens
                    (id, cena_id, asset_origem_id, character_sheet_id, nome, x, y, escala, status_bar_map, custom_data)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
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
            ]);
            await connection.commit();
            return token;
        }
        catch (error) {
            await connection.rollback();
            throw error;
        }
        finally {
            connection.release();
        }
    }
    async moveToken(roomId, userId, tokenId, x, y) {
        await this.getRoomMembership(roomId, userId);
        const connection = await this.database.getConnection();
        try {
            await connection.beginTransaction();
            const sceneId = await this.requireMasterAndActiveScene(connection, roomId, userId);
            const token = await this.getTokenInScene(connection, sceneId, tokenId, true);
            await connection.query('UPDATE tokens SET x = ?, y = ? WHERE id = ?', [x, y, tokenId]);
            await connection.commit();
            return tokenSchema.parse({ ...token, x, y });
        }
        catch (error) {
            await connection.rollback();
            throw error;
        }
        finally {
            connection.release();
        }
    }
    async removeToken(roomId, userId, tokenId) {
        await this.getRoomMembership(roomId, userId);
        const connection = await this.database.getConnection();
        try {
            await connection.beginTransaction();
            const sceneId = await this.requireMasterAndActiveScene(connection, roomId, userId);
            await this.getTokenInScene(connection, sceneId, tokenId, true);
            await connection.query('DELETE FROM tokens WHERE id = ?', [tokenId]);
            await connection.commit();
            return { id: tokenId, sceneId };
        }
        catch (error) {
            await connection.rollback();
            throw error;
        }
        finally {
            connection.release();
        }
    }
    async ensureDefaultScene(roomId) {
        const connection = await this.database.getConnection();
        try {
            await connection.beginTransaction();
            const [roomRows] = await connection.query('SELECT id FROM rooms WHERE id = ? AND status = ? LIMIT 1 FOR UPDATE', [roomId, RoomStatus.ATIVA]);
            if (!roomRows[0])
                throw new HttpError(404, 'ROOM_NOT_FOUND', 'Sala não encontrada.');
            const [boardRows] = await connection.query(`SELECT id, sala_id, nome, cena_ativa_id, created_at, updated_at
                 FROM boards WHERE sala_id = ? ORDER BY created_at ASC LIMIT 1`, [roomId]);
            let board = boardRows[0];
            if (!board) {
                const boardId = randomUUID();
                await connection.query('INSERT INTO boards (id, sala_id, nome, cena_ativa_id) VALUES (?, ?, ?, NULL)', [boardId, roomId, 'Tabuleiro principal']);
                const [createdBoards] = await connection.query(`SELECT id, sala_id, nome, cena_ativa_id, created_at, updated_at
                     FROM boards WHERE id = ? LIMIT 1`, [boardId]);
                board = createdBoards[0];
            }
            if (!board)
                throw new Error('Não foi possível preparar o tabuleiro inicial.');
            if (board.cena_ativa_id === null) {
                const sceneId = randomUUID();
                await connection.query(`INSERT INTO scenes (id, tabuleiro_id, nome, background_url, grid_config, visivel)
                     VALUES (?, ?, ?, ?, ?, TRUE)`, [
                    sceneId,
                    board.id,
                    'Cena principal',
                    env.TABLETOP_BACKGROUND_URL ?? null,
                    JSON.stringify({ enabled: true, size: env.TABLETOP_GRID_SIZE, opacity: 0.5 }),
                ]);
                await connection.query('UPDATE boards SET cena_ativa_id = ? WHERE id = ?', [sceneId, board.id]);
            }
            await connection.commit();
        }
        catch (error) {
            await connection.rollback();
            throw error;
        }
        finally {
            connection.release();
        }
    }
    async requireMasterAndActiveScene(connection, roomId, userId) {
        const [rows] = await connection.query(`SELECT b.cena_ativa_id AS scene_id, p.papel
             FROM rooms r
             INNER JOIN participants p ON p.sala_id = r.id
             INNER JOIN boards b ON b.sala_id = r.id AND b.cena_ativa_id IS NOT NULL
             WHERE r.id = ? AND r.status = ? AND p.usuario_id = ? AND p.ativo = TRUE
             ORDER BY b.created_at ASC LIMIT 1 FOR UPDATE`, [roomId, RoomStatus.ATIVA, userId]);
        const membership = rows[0];
        if (!membership)
            throw new HttpError(404, 'ROOM_NOT_FOUND', 'Sala não encontrada.');
        if (membership.papel !== ParticipantRole.MESTRE) {
            throw new HttpError(403, 'MASTER_REQUIRED', 'Somente o mestre pode alterar tokens.');
        }
        if (!membership.scene_id)
            throw new Error('A cena ativa da sala não está disponível.');
        return membership.scene_id;
    }
    async getTokenInScene(connection, sceneId, tokenId, lock) {
        const [rows] = await connection.query(`SELECT id, cena_id, asset_origem_id, character_sheet_id, nome, x, y, escala,
                    status_bar_map, custom_data
             FROM tokens WHERE id = ? AND cena_id = ? LIMIT 1${lock ? ' FOR UPDATE' : ''}`, [tokenId, sceneId]);
        const row = rows[0];
        if (!row)
            throw new HttpError(404, 'TOKEN_NOT_FOUND', 'Token não encontrado.');
        return toToken(row);
    }
}
export const tabletopService = new TabletopService();
//# sourceMappingURL=tabletop.service.js.map