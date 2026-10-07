import { randomBytes, randomUUID } from 'node:crypto';

import {
    ParticipantRole,
    RoomStatus,
    participantSchema,
    roomSchema,
    type ParticipantInput,
    type RoomInput,
} from '@motor-vtt/contracts';
import { env } from '../config/env.js';
import type { Pool, RowDataPacket } from 'mysql2/promise';

import pool from '../config/database.js';
import { HttpError } from '../http/errors.js';

type RoomRow = RowDataPacket & {
    id: string;
    nome: string;
    codigo_convite: string;
    criador_id: string;
    status: RoomStatus;
    created_at: Date;
    updated_at: Date;
};

type ParticipantRow = RowDataPacket & {
    id: string;
    sala_id: string;
    usuario_id: string;
    papel: ParticipantRole;
    ativo: boolean | number;
    preferencias_view: unknown;
    joined_at: Date;
};

type DuplicateKeyError = Error & { code?: string; sqlMessage?: string };

const MAX_INVITE_CODE_ATTEMPTS = 5;
const DEFAULT_VIEW_PREFERENCES = { zoom: 1, panX: 0, panY: 0 };

function isDuplicateKey(error: unknown): error is DuplicateKeyError {
    return typeof error === 'object'
        && error !== null
        && 'code' in error
        && error.code === 'ER_DUP_ENTRY';
}

function generateInviteCode(): string {
    return randomBytes(9).toString('base64url').toUpperCase();
}

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

function toParticipant(row: ParticipantRow): ParticipantInput {
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

export class RoomsService {
    public constructor(
        private readonly database: Pool = pool,
        private readonly inviteCodeGenerator: () => string = generateInviteCode,
    ) {}

    public async createRoom(nome: string, userId: string): Promise<RoomInput> {
        const connection = await this.database.getConnection();
        try {
            await connection.beginTransaction();

            let roomId = '';
            let inviteCode = '';
            let inserted = false;
            for (let attempt = 0; attempt < MAX_INVITE_CODE_ATTEMPTS; attempt += 1) {
                roomId = randomUUID();
                inviteCode = this.inviteCodeGenerator();
                try {
                    await connection.query(
                        `INSERT INTO rooms (id, nome, codigo_convite, criador_id, status)
                         VALUES (?, ?, ?, ?, ?)`,
                        [roomId, nome, inviteCode, userId, RoomStatus.ATIVA],
                    );
                    inserted = true;
                    break;
                } catch (error) {
                    if (!isDuplicateKey(error)) throw error;
                }
            }

            if (!inserted) {
                throw new HttpError(503, 'ROOM_CODE_UNAVAILABLE', 'Não foi possível gerar um código de convite.');
            }

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
            const boardId = randomUUID();
            const sceneId = randomUUID();
            await connection.query(
                `INSERT INTO boards (id, sala_id, nome, cena_ativa_id)
                 VALUES (?, ?, ?, NULL)`,
                [boardId, roomId, 'Tabuleiro principal'],
            );
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
            await connection.query(
                'UPDATE boards SET cena_ativa_id = ? WHERE id = ?',
                [sceneId, boardId],
            );
            const [rows] = await connection.query<RoomRow[]>(
                `SELECT id, nome, codigo_convite, criador_id, status, created_at, updated_at
                 FROM rooms WHERE id = ? LIMIT 1`,
                [roomId],
            );
            const room = rows[0];
            if (!room) throw new Error('Sala recém-criada não encontrada.');

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
        const connection = await this.database.getConnection();
        try {
            await connection.beginTransaction();
            const [roomRows] = await connection.query<RoomRow[]>(
                `SELECT id, nome, codigo_convite, criador_id, status, created_at, updated_at
                 FROM rooms WHERE codigo_convite = ? LIMIT 1 FOR UPDATE`,
                [codigoConvite],
            );
            const room = roomRows[0];
            if (!room) throw new HttpError(404, 'ROOM_NOT_FOUND', 'Sala não encontrada.');
            if (room.status !== RoomStatus.ATIVA) {
                throw new HttpError(409, 'ROOM_INACTIVE', 'Esta sala não está ativa.');
            }

            const participantId = randomUUID();
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
            const [participantRows] = await connection.query<ParticipantRow[]>(
                `SELECT id, sala_id, usuario_id, papel, ativo, preferencias_view, joined_at
                 FROM participants WHERE id = ? LIMIT 1`,
                [participantId],
            );
            const participant = participantRows[0];
            if (!participant) throw new Error('Participante recém-criado não encontrado.');

            const parsedParticipant = toParticipant(participant);
            await connection.commit();
            return parsedParticipant;
        } catch (error) {
            await connection.rollback();
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
        const room = roomRows[0];
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

function errorMessage(error: DuplicateKeyError): string {
    return `${error.sqlMessage ?? ''} ${error.message}`;
}

export const roomsService = new RoomsService();
