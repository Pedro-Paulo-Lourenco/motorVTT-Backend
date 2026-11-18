/** Encapsula criação, consulta, participação e estado persistente das salas. */
// Dependências deste módulo: cada importação fornece recursos, tipos ou integrações usados na implementação abaixo.
import { randomBytes, randomUUID } from 'node:crypto';

import {
    ParticipantRole,
    RoomStatus,
    participantSchema,
    roomSchema,
// Contrato de dados: `ParticipantInput` documenta o formato e o significado dos dados trocados entre as camadas relacionadas.
    type ParticipantInput,
// Contrato de dados: `RoomInput` documenta o formato e o significado dos dados trocados entre as camadas relacionadas.
    type RoomInput,
} from '@motor-vtt/contracts';
import { env } from '../config/env.js';
import type { Pool, RowDataPacket } from 'mysql2/promise';

import pool from '../config/database.js';
import { HttpError } from '../http/errors.js';

// Contrato de dados: `RoomRow` documenta o formato e o significado dos dados trocados entre as camadas relacionadas.
type RoomRow = RowDataPacket & {
    id: string;
    nome: string;
    codigo_convite: string;
    criador_id: string;
    status: RoomStatus;
    created_at: Date;
    updated_at: Date;
};

// Contrato de dados: `ParticipantRow` documenta o formato e o significado dos dados trocados entre as camadas relacionadas.
type ParticipantRow = RowDataPacket & {
    id: string;
    sala_id: string;
    usuario_id: string;
    papel: ParticipantRole;
    ativo: boolean | number;
    preferencias_view: unknown;
    joined_at: Date;
};

// Contrato de dados: `DuplicateKeyError` documenta o formato e o significado dos dados trocados entre as camadas relacionadas.
type DuplicateKeyError = Error & { code?: string; sqlMessage?: string };

// Estado intermediário: `MAX_INVITE_CODE_ATTEMPTS` guarda o valor que será validado, transformado ou persistido nas etapas seguintes.
const MAX_INVITE_CODE_ATTEMPTS = 5;
// Estado intermediário: `DEFAULT_VIEW_PREFERENCES` guarda o valor que será validado, transformado ou persistido nas etapas seguintes.
const DEFAULT_VIEW_PREFERENCES = { zoom: 1, panX: 0, panY: 0 };

// Função auxiliar: `isDuplicateKey` isola uma responsabilidade reutilizada neste módulo.
function isDuplicateKey(error: unknown): error is DuplicateKeyError {
    return typeof error === 'object'
        && error !== null
        && 'code' in error
        && error.code === 'ER_DUP_ENTRY';
}

// Função auxiliar: `generateInviteCode` isola uma responsabilidade reutilizada neste módulo.
function generateInviteCode(): string {
    return randomBytes(9).toString('base64url').toUpperCase();
}

// Função auxiliar: `toRoom` isola uma responsabilidade reutilizada neste módulo.
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

// Função auxiliar: `toParticipant` isola uma responsabilidade reutilizada neste módulo.
function toParticipant(row: ParticipantRow): ParticipantInput {
// Estado intermediário: `preferences` guarda o valor que será validado, transformado ou persistido nas etapas seguintes.
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

// API pública do módulo: `RoomsService` define a interface pública consumida pelos demais módulos.
export class RoomsService {
    public constructor(
        private readonly database: Pool = pool,
        private readonly inviteCodeGenerator: () => string = generateInviteCode,
    ) {}

    public async createRoom(nome: string, userId: string, templateId?: string): Promise<RoomInput> {
// Estado intermediário: `connection` guarda o valor que será validado, transformado ou persistido nas etapas seguintes.
        const connection = await this.database.getConnection();
// Tratamento protegido: garante que o recurso seja finalizado e que erros sigam para o fluxo central de tratamento.
        try {
            await connection.beginTransaction();

// Estado intermediário: `roomId` guarda o valor que será validado, transformado ou persistido nas etapas seguintes.
            let roomId = '';
// Estado intermediário: `inviteCode` guarda o valor que será validado, transformado ou persistido nas etapas seguintes.
            let inviteCode = '';
// Estado intermediário: `inserted` guarda o valor que será validado, transformado ou persistido nas etapas seguintes.
            let inserted = false;
// Iteração: percorre todos os elementos para aplicar a mesma regra a cada item.
            for (let attempt = 0; attempt < MAX_INVITE_CODE_ATTEMPTS; attempt += 1) {
                roomId = randomUUID();
                inviteCode = this.inviteCodeGenerator();
// Tratamento protegido: garante que o recurso seja finalizado e que erros sigam para o fluxo central de tratamento.
                try {
// Persistência: esta consulta lê ou altera os registros necessários para manter o estado da aplicação consistente.
                    await connection.query(
                        `INSERT INTO rooms (id, nome, codigo_convite, criador_id, status)
                         VALUES (?, ?, ?, ?, ?)`,
                        [roomId, nome, inviteCode, userId, RoomStatus.ATIVA],
                    );
                    inserted = true;
                    break;
                } catch (error) {
// Regra de negócio: a validação abaixo decide se o fluxo pode continuar ou deve retornar antecipadamente.
                    if (!isDuplicateKey(error)) throw error;
                }
            }

// Regra de negócio: a validação abaixo decide se o fluxo pode continuar ou deve retornar antecipadamente.
            if (!inserted) {
                throw new HttpError(503, 'ROOM_CODE_UNAVAILABLE', 'Não foi possível gerar um código de convite.');
            }

// Regra de negócio: a validação abaixo decide se o fluxo pode continuar ou deve retornar antecipadamente.
            if (templateId) {
// Persistência: esta consulta lê ou altera os registros necessários para manter o estado da aplicação consistente.
                const [templateResult] = await connection.query(`INSERT IGNORE INTO room_sheet_templates (sala_id, template_id) SELECT ?, id FROM sheet_templates WHERE id = ? AND usuario_id = ?`, [roomId, templateId, userId]);
// Regra de negócio: a validação abaixo decide se o fluxo pode continuar ou deve retornar antecipadamente.
                if ((templateResult as { affectedRows: number }).affectedRows === 0) throw new HttpError(404, 'SHEET_TEMPLATE_NOT_FOUND', 'Template de ficha não encontrado.');
            }

// Persistência: esta consulta lê ou altera os registros necessários para manter o estado da aplicação consistente.
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
// Estado intermediário: `boardId` guarda o valor que será validado, transformado ou persistido nas etapas seguintes.
            const boardId = randomUUID();
// Estado intermediário: `sceneId` guarda o valor que será validado, transformado ou persistido nas etapas seguintes.
            const sceneId = randomUUID();
// Persistência: esta consulta lê ou altera os registros necessários para manter o estado da aplicação consistente.
            await connection.query(
                `INSERT INTO boards (id, sala_id, nome, cena_ativa_id)
                 VALUES (?, ?, ?, NULL)`,
                [boardId, roomId, 'Tabuleiro principal'],
            );
// Persistência: esta consulta lê ou altera os registros necessários para manter o estado da aplicação consistente.
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
// Persistência: esta consulta lê ou altera os registros necessários para manter o estado da aplicação consistente.
            await connection.query(
                'UPDATE boards SET cena_ativa_id = ? WHERE id = ?',
                [sceneId, boardId],
            );
// Persistência: esta consulta lê ou altera os registros necessários para manter o estado da aplicação consistente.
            const [rows] = await connection.query<RoomRow[]>(
                `SELECT id, nome, codigo_convite, criador_id, status, created_at, updated_at
                 FROM rooms WHERE id = ? LIMIT 1`,
                [roomId],
            );
// Estado intermediário: `room` guarda o valor que será validado, transformado ou persistido nas etapas seguintes.
            const room = rows[0];
// Regra de negócio: a validação abaixo decide se o fluxo pode continuar ou deve retornar antecipadamente.
            if (!room) throw new Error('Sala recém-criada não encontrada.');

// Estado intermediário: `parsedRoom` guarda o valor que será validado, transformado ou persistido nas etapas seguintes.
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
// Estado intermediário: `connection` guarda o valor que será validado, transformado ou persistido nas etapas seguintes.
        const connection = await this.database.getConnection();
// Tratamento protegido: garante que o recurso seja finalizado e que erros sigam para o fluxo central de tratamento.
        try {
            await connection.beginTransaction();
// Persistência: esta consulta lê ou altera os registros necessários para manter o estado da aplicação consistente.
            const [roomRows] = await connection.query<RoomRow[]>(
                `SELECT id, nome, codigo_convite, criador_id, status, created_at, updated_at
                 FROM rooms WHERE codigo_convite = ? LIMIT 1 FOR UPDATE`,
                [codigoConvite],
            );
// Estado intermediário: `room` guarda o valor que será validado, transformado ou persistido nas etapas seguintes.
            const room = roomRows[0];
// Regra de negócio: a validação abaixo decide se o fluxo pode continuar ou deve retornar antecipadamente.
            if (!room) throw new HttpError(404, 'ROOM_NOT_FOUND', 'Sala não encontrada.');
// Regra de negócio: a validação abaixo decide se o fluxo pode continuar ou deve retornar antecipadamente.
            if (room.status !== RoomStatus.ATIVA) {
                throw new HttpError(409, 'ROOM_INACTIVE', 'Esta sala não está ativa.');
            }

// Estado intermediário: `participantId` guarda o valor que será validado, transformado ou persistido nas etapas seguintes.
            const participantId = randomUUID();
// Persistência: esta consulta lê ou altera os registros necessários para manter o estado da aplicação consistente.
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
// Persistência: esta consulta lê ou altera os registros necessários para manter o estado da aplicação consistente.
            const [participantRows] = await connection.query<ParticipantRow[]>(
                `SELECT id, sala_id, usuario_id, papel, ativo, preferencias_view, joined_at
                 FROM participants WHERE id = ? LIMIT 1`,
                [participantId],
            );
// Estado intermediário: `participant` guarda o valor que será validado, transformado ou persistido nas etapas seguintes.
            const participant = participantRows[0];
// Regra de negócio: a validação abaixo decide se o fluxo pode continuar ou deve retornar antecipadamente.
            if (!participant) throw new Error('Participante recém-criado não encontrado.');

// Estado intermediário: `parsedParticipant` guarda o valor que será validado, transformado ou persistido nas etapas seguintes.
            const parsedParticipant = toParticipant(participant);
            await connection.commit();
            return parsedParticipant;
        } catch (error) {
            await connection.rollback();
// Regra de negócio: a validação abaixo decide se o fluxo pode continuar ou deve retornar antecipadamente.
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
// Estado intermediário: `room` guarda o valor que será validado, transformado ou persistido nas etapas seguintes.
        const room = roomRows[0];
// Regra de negócio: a validação abaixo decide se o fluxo pode continuar ou deve retornar antecipadamente.
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

// Função auxiliar: `errorMessage` isola uma responsabilidade reutilizada neste módulo.
function errorMessage(error: DuplicateKeyError): string {
    return `${error.sqlMessage ?? ''} ${error.message}`;
}

// API pública do módulo: `roomsService` define a interface pública consumida pelos demais módulos.
export const roomsService = new RoomsService();
