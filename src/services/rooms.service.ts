/** Encapsula criação, consulta, participação e estado persistente das salas. */
// Importações: reúnem bibliotecas, tipos e módulos locais usados pelos blocos seguintes.
import { randomBytes, randomUUID } from 'node:crypto';

import {
    ParticipantRole,
    RoomStatus,
    participantSchema,
    roomSchema,
// Tipo: `ParticipantInput` descreve o formato estruturado usado nas operações relacionadas.
    type ParticipantInput,
// Tipo: `RoomInput` descreve o formato estruturado usado nas operações relacionadas.
    type RoomInput,
} from '@motor-vtt/contracts';
import { env } from '../config/env.js';
import type { Pool, RowDataPacket } from 'mysql2/promise';

import pool from '../config/database.js';
import { HttpError } from '../http/errors.js';

// Tipo: `RoomRow` descreve o formato estruturado usado nas operações relacionadas.
type RoomRow = RowDataPacket & {
    id: string;
    nome: string;
    codigo_convite: string;
    criador_id: string;
    status: RoomStatus;
    created_at: Date;
    updated_at: Date;
};

// Tipo: `ParticipantRow` descreve o formato estruturado usado nas operações relacionadas.
type ParticipantRow = RowDataPacket & {
    id: string;
    sala_id: string;
    usuario_id: string;
    papel: ParticipantRole;
    ativo: boolean | number;
    preferencias_view: unknown;
    joined_at: Date;
};

// Tipo: `DuplicateKeyError` descreve o formato estruturado usado nas operações relacionadas.
type DuplicateKeyError = Error & { code?: string; sqlMessage?: string };

// Constante ou estado local: `MAX_INVITE_CODE_ATTEMPTS` mantém o dado necessário ao fluxo abaixo.
const MAX_INVITE_CODE_ATTEMPTS = 5;
// Constante ou estado local: `DEFAULT_VIEW_PREFERENCES` mantém o dado necessário ao fluxo abaixo.
const DEFAULT_VIEW_PREFERENCES = { zoom: 1, panX: 0, panY: 0 };

// Bloco local: `isDuplicateKey` concentra uma responsabilidade reutilizada dentro deste módulo.
function isDuplicateKey(error: unknown): error is DuplicateKeyError {
    return typeof error === 'object'
        && error !== null
        && 'code' in error
        && error.code === 'ER_DUP_ENTRY';
}

// Bloco local: `generateInviteCode` concentra uma responsabilidade reutilizada dentro deste módulo.
function generateInviteCode(): string {
    return randomBytes(9).toString('base64url').toUpperCase();
}

// Bloco local: `toRoom` concentra uma responsabilidade reutilizada dentro deste módulo.
function toRoom(row: RoomRow): RoomInput {
    return roomSchema.parse({
        id: row.id,
        nome: row.nome,
        codigoConvite: row.codigo_convite,
        criadorId: row.criador_id,
        status: row.status,
        createdAt: row.created_at.toISOString(),
        updatedAt: row.updated_at.toISOString(),
    });
}

// Bloco local: `toParticipant` concentra uma responsabilidade reutilizada dentro deste módulo.
function toParticipant(row: ParticipantRow): ParticipantInput {
// Constante ou estado local: `preferences` mantém o dado necessário ao fluxo abaixo.
    const preferences = typeof row.preferencias_view === 'string'
        ? JSON.parse(row.preferencias_view) as unknown
        : row.preferencias_view;

    return participantSchema.parse({
        id: row.id,
        salaId: row.sala_id,
        usuarioId: row.usuario_id,
        papel: row.papel,
        ativo: Boolean(row.ativo),
        preferenciasView: preferences,
        joinedAt: row.joined_at.toISOString(),
    });
}

// Exportação principal: `RoomsService` disponibiliza esta responsabilidade para os consumidores deste módulo.
export class RoomsService {
    public constructor(
        private readonly database: Pool = pool,
        private readonly inviteCodeGenerator: () => string = generateInviteCode,
    ) {}

    public async createRoom(nome: string, userId: string, templateId?: string): Promise<RoomInput> {
// Constante ou estado local: `connection` mantém o dado necessário ao fluxo abaixo.
        const connection = await this.database.getConnection();
// Bloco protegido: mantém o fluxo principal e suas finalizações ou tratamentos associados.
        try {
            await connection.beginTransaction();

// Constante ou estado local: `roomId` mantém o dado necessário ao fluxo abaixo.
            let roomId = '';
// Constante ou estado local: `inviteCode` mantém o dado necessário ao fluxo abaixo.
            let inviteCode = '';
// Constante ou estado local: `inserted` mantém o dado necessário ao fluxo abaixo.
            let inserted = false;
// Iteração: processa repetidamente os elementos ou tentativas deste bloco.
            for (let attempt = 0; attempt < MAX_INVITE_CODE_ATTEMPTS; attempt += 1) {
                roomId = randomUUID();
                inviteCode = this.inviteCodeGenerator();
// Bloco protegido: mantém o fluxo principal e suas finalizações ou tratamentos associados.
                try {
// Consulta SQL: acessa ou altera registros no banco conforme parâmetros e condições desta instrução.
                    await connection.query(
                        `INSERT INTO rooms (id, nome, codigo_convite, criador_id, status)
                         VALUES (?, ?, ?, ?, ?)`,
                        [roomId, nome, inviteCode, userId, RoomStatus.ATIVA],
                    );
                    inserted = true;
                    break;
                } catch (error) {
// Condição: altera o caminho de execução somente quando a regra indicada é verdadeira.
                    if (!isDuplicateKey(error)) throw error;
                }
            }

// Condição: altera o caminho de execução somente quando a regra indicada é verdadeira.
            if (!inserted) {
                throw new HttpError(503, 'ROOM_CODE_UNAVAILABLE', 'Não foi possível gerar um código de convite.');
            }

// Condição: altera o caminho de execução somente quando a regra indicada é verdadeira.
            if (templateId) {
// Consulta SQL: acessa ou altera registros no banco conforme parâmetros e condições desta instrução.
                const [templateResult] = await connection.query(`INSERT IGNORE INTO room_sheet_templates (sala_id, template_id) SELECT ?, id FROM sheet_templates WHERE id = ? AND usuario_id = ?`, [roomId, templateId, userId]);
// Condição: altera o caminho de execução somente quando a regra indicada é verdadeira.
                if ((templateResult as { affectedRows: number }).affectedRows === 0) throw new HttpError(404, 'SHEET_TEMPLATE_NOT_FOUND', 'Template de ficha não encontrado.');
            }

// Consulta SQL: acessa ou altera registros no banco conforme parâmetros e condições desta instrução.
            await connection.query(
                `INSERT INTO participants
                    (id, sala_id, usuario_id, papel, preferencias_view)
                 VALUES (?, ?, ?, ?, ?)`,
                [
                    randomUUID(),
                    roomId,
                    userId,
                    ParticipantRole.MESTRE,
                    JSON.stringify(DEFAULT_VIEW_PREFERENCES),
                ],
            );
// Constante ou estado local: `boardId` mantém o dado necessário ao fluxo abaixo.
            const boardId = randomUUID();
// Constante ou estado local: `sceneId` mantém o dado necessário ao fluxo abaixo.
            const sceneId = randomUUID();
// Consulta SQL: acessa ou altera registros no banco conforme parâmetros e condições desta instrução.
            await connection.query(
                `INSERT INTO boards (id, sala_id, nome, cena_ativa_id)
                 VALUES (?, ?, ?, NULL)`,
                [boardId, roomId, 'Tabuleiro principal'],
            );
// Consulta SQL: acessa ou altera registros no banco conforme parâmetros e condições desta instrução.
            await connection.query(
                `INSERT INTO scenes (id, tabuleiro_id, nome, background_url, grid_config, visivel)
                 VALUES (?, ?, ?, ?, ?, TRUE)`,
                [
                    sceneId,
                    boardId,
                    'Cena principal',
                    env.TABLETOP_BACKGROUND_URL ?? null,
                    JSON.stringify({ enabled: true, size: env.TABLETOP_GRID_SIZE, opacity: 0.5 }),
                ],
            );
// Consulta SQL: acessa ou altera registros no banco conforme parâmetros e condições desta instrução.
            await connection.query(
                'UPDATE boards SET cena_ativa_id = ? WHERE id = ?',
                [sceneId, boardId],
            );
// Consulta SQL: acessa ou altera registros no banco conforme parâmetros e condições desta instrução.
            const [rows] = await connection.query<RoomRow[]>(
                `SELECT id, nome, codigo_convite, criador_id, status, created_at, updated_at
                 FROM rooms WHERE id = ? LIMIT 1`,
                [roomId],
            );
// Constante ou estado local: `room` mantém o dado necessário ao fluxo abaixo.
            const room = rows[0];
// Condição: altera o caminho de execução somente quando a regra indicada é verdadeira.
            if (!room) throw new Error('Sala recém-criada não encontrada.');

// Constante ou estado local: `parsedRoom` mantém o dado necessário ao fluxo abaixo.
            const parsedRoom = toRoom(room);
            await connection.commit();
            return parsedRoom;
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    }

    public async listRooms(userId: string): Promise<RoomInput[]> {
        const [rows] = await this.database.query<RoomRow[]>(
            `SELECT r.id, r.nome, r.codigo_convite, r.criador_id, r.status, r.created_at, r.updated_at
             FROM rooms r
             INNER JOIN participants p ON p.sala_id = r.id
             WHERE p.usuario_id = ? AND p.ativo = TRUE
             ORDER BY r.updated_at DESC`,
            [userId],
        );
        return rows.map(toRoom);
    }

    public async joinRoom(codigoConvite: string, userId: string): Promise<ParticipantInput> {
// Constante ou estado local: `connection` mantém o dado necessário ao fluxo abaixo.
        const connection = await this.database.getConnection();
// Bloco protegido: mantém o fluxo principal e suas finalizações ou tratamentos associados.
        try {
            await connection.beginTransaction();
// Consulta SQL: acessa ou altera registros no banco conforme parâmetros e condições desta instrução.
            const [roomRows] = await connection.query<RoomRow[]>(
                `SELECT id, nome, codigo_convite, criador_id, status, created_at, updated_at
                 FROM rooms WHERE codigo_convite = ? LIMIT 1 FOR UPDATE`,
                [codigoConvite],
            );
// Constante ou estado local: `room` mantém o dado necessário ao fluxo abaixo.
            const room = roomRows[0];
// Condição: altera o caminho de execução somente quando a regra indicada é verdadeira.
            if (!room) throw new HttpError(404, 'ROOM_NOT_FOUND', 'Sala não encontrada.');
// Condição: altera o caminho de execução somente quando a regra indicada é verdadeira.
            if (room.status !== RoomStatus.ATIVA) {
                throw new HttpError(409, 'ROOM_INACTIVE', 'Esta sala não está ativa.');
            }

// Constante ou estado local: `participantId` mantém o dado necessário ao fluxo abaixo.
            const participantId = randomUUID();
// Consulta SQL: acessa ou altera registros no banco conforme parâmetros e condições desta instrução.
            await connection.query(
                `INSERT INTO participants
                    (id, sala_id, usuario_id, papel, preferencias_view)
                 VALUES (?, ?, ?, ?, ?)`,
                [
                    participantId,
                    room.id,
                    userId,
                    ParticipantRole.JOGADOR,
                    JSON.stringify(DEFAULT_VIEW_PREFERENCES),
                ],
            );
// Consulta SQL: acessa ou altera registros no banco conforme parâmetros e condições desta instrução.
            const [participantRows] = await connection.query<ParticipantRow[]>(
                `SELECT id, sala_id, usuario_id, papel, ativo, preferencias_view, joined_at
                 FROM participants WHERE id = ? LIMIT 1`,
                [participantId],
            );
// Constante ou estado local: `participant` mantém o dado necessário ao fluxo abaixo.
            const participant = participantRows[0];
// Condição: altera o caminho de execução somente quando a regra indicada é verdadeira.
            if (!participant) throw new Error('Participante recém-criado não encontrado.');

// Constante ou estado local: `parsedParticipant` mantém o dado necessário ao fluxo abaixo.
            const parsedParticipant = toParticipant(participant);
            await connection.commit();
            return parsedParticipant;
        } catch (error) {
            await connection.rollback();
// Condição: altera o caminho de execução somente quando a regra indicada é verdadeira.
            if (isDuplicateKey(error) && errorMessage(error).includes('uq_participants_room_user')) {
                throw new HttpError(409, 'ALREADY_PARTICIPANT', 'Você já participa desta sala.');
            }
            throw error;
        } finally {
            connection.release();
        }
    }

    public async getRoomForParticipant(
        roomId: string,
        userId: string,
    ): Promise<{ sala: RoomInput; participantes: ParticipantInput[] }> {
        const [roomRows] = await this.database.query<RoomRow[]>(
            `SELECT r.id, r.nome, r.codigo_convite, r.criador_id, r.status, r.created_at, r.updated_at
             FROM rooms r
             INNER JOIN participants access
                ON access.sala_id = r.id AND access.usuario_id = ? AND access.ativo = TRUE
             WHERE r.id = ?
             LIMIT 1`,
            [userId, roomId],
        );
// Constante ou estado local: `room` mantém o dado necessário ao fluxo abaixo.
        const room = roomRows[0];
// Condição: altera o caminho de execução somente quando a regra indicada é verdadeira.
        if (!room) throw new HttpError(404, 'ROOM_NOT_FOUND', 'Sala não encontrada.');

        const [participantRows] = await this.database.query<ParticipantRow[]>(
            `SELECT id, sala_id, usuario_id, papel, ativo, preferencias_view, joined_at
             FROM participants WHERE sala_id = ? ORDER BY joined_at ASC`,
            [roomId],
        );
        return {
            sala: toRoom(room),
            participantes: participantRows.map(toParticipant),
        };
    }
}

// Bloco local: `errorMessage` concentra uma responsabilidade reutilizada dentro deste módulo.
function errorMessage(error: DuplicateKeyError): string {
    return `${error.sqlMessage ?? ''} ${error.message}`;
}

// Exportação principal: `roomsService` disponibiliza esta responsabilidade para os consumidores deste módulo.
export const roomsService = new RoomsService();
