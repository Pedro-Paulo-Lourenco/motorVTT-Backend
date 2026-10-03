import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { describe, it } from 'node:test';

import { ParticipantRole, RoomStatus } from '@motor-vtt/contracts';
import type { Pool } from 'mysql2/promise';

import { HttpError } from '../src/http/errors.js';
import { RoomsService } from '../src/services/rooms.service.js';

type TestRoom = {
    id: string;
    nome: string;
    codigo_convite: string;
    criador_id: string;
    status: RoomStatus;
    created_at: Date;
    updated_at: Date;
};

type TestParticipant = {
    id: string;
    sala_id: string;
    usuario_id: string;
    papel: ParticipantRole;
    ativo: boolean;
    preferencias_view: unknown;
    joined_at: Date;
};

function duplicateError(key: string): Error & { code: string; sqlMessage: string } {
    return Object.assign(new Error(`Duplicate entry for key '${key}'`), {
        code: 'ER_DUP_ENTRY',
        sqlMessage: `Duplicate entry for key '${key}'`,
    });
}

class FakeDatabase {
    public readonly rooms: TestRoom[] = [];
    public readonly participants: TestParticipant[] = [];
    public failParticipantInsert = false;
    public transactionStarted = false;
    public transactionCommitted = false;
    public transactionRolledBack = false;
    public participantListQueries = 0;
    private snapshot?: { rooms: TestRoom[]; participants: TestParticipant[] };

    public readonly connection = {
        beginTransaction: async (): Promise<void> => {
            this.transactionStarted = true;
            this.snapshot = {
                rooms: [...this.rooms],
                participants: [...this.participants],
            };
        },
        commit: async (): Promise<void> => {
            this.transactionCommitted = true;
        },
        rollback: async (): Promise<void> => {
            this.transactionRolledBack = true;
            if (this.snapshot) {
                this.rooms.splice(0, this.rooms.length, ...this.snapshot.rooms);
                this.participants.splice(0, this.participants.length, ...this.snapshot.participants);
            }
        },
        release: (): void => {},
        query: async (sql: string, values: unknown[] = []): Promise<[unknown[], unknown]> => {
            if (sql.includes('INSERT INTO rooms')) {
                const [id, nome, codigo, criadorId, status] = values as [string, string, string, string, RoomStatus];
                if (this.rooms.some((room) => room.codigo_convite === codigo)) {
                    throw duplicateError('uq_rooms_invite_code');
                }
                const now = new Date('2026-01-01T00:00:00.000Z');
                this.rooms.push({
                    id,
                    nome,
                    codigo_convite: codigo,
                    criador_id: criadorId,
                    status,
                    created_at: now,
                    updated_at: now,
                });
                return [[], []];
            }
            if (sql.includes('INSERT INTO participants')) {
                if (this.failParticipantInsert) throw new Error('participant insert failed');
                const [id, roomId, userId, role, preferences] = values as [
                    string, string, string, ParticipantRole, string,
                ];
                if (this.participants.some((p) => p.sala_id === roomId && p.usuario_id === userId)) {
                    throw duplicateError('uq_participants_room_user');
                }
                this.participants.push({
                    id,
                    sala_id: roomId,
                    usuario_id: userId,
                    papel: role,
                    ativo: true,
                    preferencias_view: JSON.parse(preferences) as unknown,
                    joined_at: new Date('2026-01-01T00:00:00.000Z'),
                });
                return [[], []];
            }
            if (sql.includes('FROM rooms WHERE codigo_convite')) {
                return [this.rooms.filter((room) => room.codigo_convite === values[0]), []];
            }
            if (sql.includes('INNER JOIN participants access')) {
                const [userId, roomId] = values as [string, string];
                const room = this.rooms.find((entry) => entry.id === roomId);
                const hasAccess = this.participants.some(
                    (participant) => participant.sala_id === roomId
                        && participant.usuario_id === userId
                        && participant.ativo,
                );
                return [room && hasAccess ? [room] : [], []];
            }
            if (sql.includes('FROM rooms WHERE id')) {
                return [this.rooms.filter((room) => room.id === values[0]), []];
            }
            if (sql.includes('FROM participants WHERE id')) {
                return [this.participants.filter((participant) => participant.id === values[0]), []];
            }
            if (sql.includes('FROM participants WHERE sala_id')) {
                this.participantListQueries += 1;
                return [this.participants.filter((participant) => participant.sala_id === values[0]), []];
            }
            if (sql.includes('INNER JOIN participants p')) {
                const userId = values[0];
                return [this.rooms.filter((room) => this.participants.some(
                    (participant) => participant.sala_id === room.id
                        && participant.usuario_id === userId
                        && participant.ativo,
                )), []];
            }
            throw new Error(`Query não suportada no teste: ${sql}`);
        },
    };

    public readonly pool = {
        getConnection: async (): Promise<typeof this.connection> => this.connection,
        query: this.connection.query,
    } as unknown as Pool;
}

function makeRoom(
    database: FakeDatabase,
    options: { status?: RoomStatus; code?: string; userId?: string } = {},
): TestRoom {
    const now = new Date('2026-01-01T00:00:00.000Z');
    const room: TestRoom = {
        id: randomUUID(),
        nome: 'Campanha',
        codigo_convite: options.code ?? 'CONVITE123',
        criador_id: options.userId ?? randomUUID(),
        status: options.status ?? RoomStatus.ATIVA,
        created_at: now,
        updated_at: now,
    };
    database.rooms.push(room);
    return room;
}

function makeParticipant(room: TestRoom, userId: string, role = ParticipantRole.JOGADOR): TestParticipant {
    return {
        id: randomUUID(),
        sala_id: room.id,
        usuario_id: userId,
        papel: role,
        ativo: true,
        preferencias_view: { zoom: 1, panX: 0, panY: 0 },
        joined_at: new Date('2026-01-01T00:00:00.000Z'),
    };
}

describe('operações de sala', () => {
    it('cria sala e mestre atomicamente, repetindo código de convite em colisão', async () => {
        const database = new FakeDatabase();
        makeRoom(database, { code: 'COLLISION' });
        const codes = ['COLLISION', 'UNIQUECODE'];
        const service = new RoomsService(database.pool, () => {
            const next = codes.shift();
            if (!next) throw new Error('Código de teste indisponível.');
            return next;
        });
        const userId = randomUUID();

        const room = await service.createRoom('Campanha', userId);

        assert.equal(room.codigoConvite, 'UNIQUECODE');
        assert.equal(room.nome, 'Campanha');
        assert.equal(database.rooms.length, 2);
        assert.equal(database.participants.length, 1);
        assert.equal(database.participants[0]?.usuario_id, userId);
        assert.equal(database.participants[0]?.papel, ParticipantRole.MESTRE);
        assert.deepEqual(database.participants[0]?.preferencias_view, { zoom: 1, panX: 0, panY: 0 });
        assert.equal(database.transactionStarted, true);
        assert.equal(database.transactionCommitted, true);
        assert.equal(database.transactionRolledBack, false);
    });

    it('faz rollback da sala quando não consegue criar o participante mestre', async () => {
        const database = new FakeDatabase();
        database.failParticipantInsert = true;
        const service = new RoomsService(database.pool, () => 'UNIQUECODE');

        await assert.rejects(service.createRoom('Campanha', randomUUID()), /participant insert failed/);
        assert.equal(database.rooms.length, 0);
        assert.equal(database.participants.length, 0);
        assert.equal(database.transactionCommitted, false);
        assert.equal(database.transactionRolledBack, true);
    });

    it('lista salas por participação, inclusive quando o usuário não é criador', async () => {
        const database = new FakeDatabase();
        const room = makeRoom(database);
        const userId = randomUUID();
        database.participants.push(makeParticipant(room, userId));
        const service = new RoomsService(database.pool);

        const rooms = await service.listRooms(userId);

        assert.deepEqual(rooms.map((entry) => entry.id), [room.id]);
        assert.notEqual(rooms[0]?.criadorId, userId);
    });

    it('associa usuário à sala ativa como jogador', async () => {
        const database = new FakeDatabase();
        const room = makeRoom(database);
        const userId = randomUUID();
        const service = new RoomsService(database.pool);

        const participant = await service.joinRoom(room.codigo_convite, userId);

        assert.equal(participant.salaId, room.id);
        assert.equal(participant.usuarioId, userId);
        assert.equal(participant.papel, ParticipantRole.JOGADOR);
        assert.deepEqual(participant.preferenciasView, { zoom: 1, panX: 0, panY: 0 });
        assert.equal(database.transactionCommitted, true);
    });

    it('rejeita código inexistente e sala inativa com erros previsíveis', async () => {
        const database = new FakeDatabase();
        const service = new RoomsService(database.pool);
        await assert.rejects(
            service.joinRoom('MISSING1', randomUUID()),
            (error: unknown) => error instanceof HttpError
                && error.statusCode === 404 && error.code === 'ROOM_NOT_FOUND',
        );

        const inactiveRoom = makeRoom(database, { status: RoomStatus.PAUSADA });
        await assert.rejects(
            service.joinRoom(inactiveRoom.codigo_convite, randomUUID()),
            (error: unknown) => error instanceof HttpError
                && error.statusCode === 409 && error.code === 'ROOM_INACTIVE',
        );
    });

    it('converte a violação da constraint de participação duplicada em conflito', async () => {
        const database = new FakeDatabase();
        const room = makeRoom(database);
        const userId = randomUUID();
        database.participants.push(makeParticipant(room, userId));
        const service = new RoomsService(database.pool);

        await assert.rejects(
            service.joinRoom(room.codigo_convite, userId),
            (error: unknown) => error instanceof HttpError
                && error.statusCode === 409 && error.code === 'ALREADY_PARTICIPANT',
        );
    });

    it('retorna sala e participantes para membro e não consulta dados para usuário externo', async () => {
        const database = new FakeDatabase();
        const room = makeRoom(database);
        const memberId = randomUUID();
        const outsiderId = randomUUID();
        database.participants.push(makeParticipant(room, memberId, ParticipantRole.MESTRE));
        database.participants.push(makeParticipant(room, randomUUID()));
        const service = new RoomsService(database.pool);

        const lobby = await service.getRoomForParticipant(room.id, memberId);
        assert.equal(lobby.sala.id, room.id);
        assert.equal(lobby.participantes.length, 2);
        assert.equal(database.participantListQueries, 1);

        await assert.rejects(
            service.getRoomForParticipant(room.id, outsiderId),
            (error: unknown) => error instanceof HttpError
                && error.statusCode === 404 && error.code === 'ROOM_NOT_FOUND',
        );
        assert.equal(database.participantListQueries, 1);
    });
});
