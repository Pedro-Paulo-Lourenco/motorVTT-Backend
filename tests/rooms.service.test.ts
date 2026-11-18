/** Verifica as regras de domínio do serviço de salas. */
// Importações: reúnem bibliotecas, tipos e módulos locais usados pelos blocos seguintes.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { describe, it } from 'node:test';

import { ParticipantRole, RoomStatus } from '@motor-vtt/contracts';
import type { Pool } from 'mysql2/promise';

import { HttpError } from '../src/http/errors.js';
import { RoomsService } from '../src/services/rooms.service.js';

// Tipo: `TestRoom` descreve o formato estruturado usado nas operações relacionadas.
type TestRoom = {
    id: string;
    nome: string;
    codigo_convite: string;
    criador_id: string;
    status: RoomStatus;
    created_at: Date;
    updated_at: Date;
};

// Tipo: `TestParticipant` descreve o formato estruturado usado nas operações relacionadas.
type TestParticipant = {
    id: string;
    sala_id: string;
    usuario_id: string;
    papel: ParticipantRole;
    ativo: boolean;
    preferencias_view: unknown;
    joined_at: Date;
};

// Bloco local: `duplicateError` concentra uma responsabilidade reutilizada dentro deste módulo.
function duplicateError(key: string): Error & { code: string; sqlMessage: string } {
    return Object.assign(new Error(`Duplicate entry for key '${key}'`), {
        code: 'ER_DUP_ENTRY',
        sqlMessage: `Duplicate entry for key '${key}'`,
    });
}

// Bloco local: `FakeDatabase` concentra uma responsabilidade reutilizada dentro deste módulo.
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
// Condição: altera o caminho de execução somente quando a regra indicada é verdadeira.
            if (this.snapshot) {
                this.rooms.splice(0, this.rooms.length, ...this.snapshot.rooms);
                this.participants.splice(0, this.participants.length, ...this.snapshot.participants);
            }
        },
        release: (): void => {},
        query: async (sql: string, values: unknown[] = []): Promise<[unknown[], unknown]> => {
// Condição: altera o caminho de execução somente quando a regra indicada é verdadeira.
            if (sql.includes('INSERT INTO rooms')) {
                const [id, nome, codigo, criadorId, status] = values as [string, string, string, string, RoomStatus];
// Condição: altera o caminho de execução somente quando a regra indicada é verdadeira.
                if (this.rooms.some((room) => room.codigo_convite === codigo)) {
                    throw duplicateError('uq_rooms_invite_code');
                }
// Constante ou estado local: `now` mantém o dado necessário ao fluxo abaixo.
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
// Condição: altera o caminho de execução somente quando a regra indicada é verdadeira.
            if (sql.includes('INSERT INTO participants')) {
// Condição: altera o caminho de execução somente quando a regra indicada é verdadeira.
                if (this.failParticipantInsert) throw new Error('participant insert failed');
                const [id, roomId, userId, role, preferences] = values as [
                    string, string, string, ParticipantRole, string,
                ];
// Condição: altera o caminho de execução somente quando a regra indicada é verdadeira.
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
// Condição: altera o caminho de execução somente quando a regra indicada é verdadeira.
            if (sql.includes('INSERT INTO boards')) return [[], []];
// Condição: altera o caminho de execução somente quando a regra indicada é verdadeira.
            if (sql.includes('INSERT INTO scenes')) return [[], []];
// Condição: altera o caminho de execução somente quando a regra indicada é verdadeira.
            if (sql.includes('UPDATE boards SET cena_ativa_id')) return [[], []];
// Condição: altera o caminho de execução somente quando a regra indicada é verdadeira.
            if (sql.includes('FROM rooms WHERE codigo_convite')) {
                return [this.rooms.filter((room) => room.codigo_convite === values[0]), []];
            }
// Condição: altera o caminho de execução somente quando a regra indicada é verdadeira.
            if (sql.includes('INNER JOIN participants access')) {
                const [userId, roomId] = values as [string, string];
// Constante ou estado local: `room` mantém o dado necessário ao fluxo abaixo.
                const room = this.rooms.find((entry) => entry.id === roomId);
// Constante ou estado local: `hasAccess` mantém o dado necessário ao fluxo abaixo.
                const hasAccess = this.participants.some(
                    (participant) => participant.sala_id === roomId
                        && participant.usuario_id === userId
                        && participant.ativo,
                );
                return [room && hasAccess ? [room] : [], []];
            }
// Condição: altera o caminho de execução somente quando a regra indicada é verdadeira.
            if (sql.includes('FROM rooms WHERE id')) {
                return [this.rooms.filter((room) => room.id === values[0]), []];
            }
// Condição: altera o caminho de execução somente quando a regra indicada é verdadeira.
            if (sql.includes('FROM participants WHERE id')) {
                return [this.participants.filter((participant) => participant.id === values[0]), []];
            }
// Condição: altera o caminho de execução somente quando a regra indicada é verdadeira.
            if (sql.includes('FROM participants WHERE sala_id')) {
                this.participantListQueries += 1;
                return [this.participants.filter((participant) => participant.sala_id === values[0]), []];
            }
// Condição: altera o caminho de execução somente quando a regra indicada é verdadeira.
            if (sql.includes('INNER JOIN participants p')) {
// Constante ou estado local: `userId` mantém o dado necessário ao fluxo abaixo.
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
// Consulta SQL: acessa ou altera registros no banco conforme parâmetros e condições desta instrução.
        query: this.connection.query,
    } as unknown as Pool;
}

// Bloco local: `makeRoom` concentra uma responsabilidade reutilizada dentro deste módulo.
function makeRoom(
    database: FakeDatabase,
    options: { status?: RoomStatus; code?: string; userId?: string } = {},
): TestRoom {
// Constante ou estado local: `now` mantém o dado necessário ao fluxo abaixo.
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

// Bloco local: `makeParticipant` concentra uma responsabilidade reutilizada dentro deste módulo.
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

// Grupo de testes: reúne cenários que exercitam uma mesma área do comportamento.
describe('operações de sala', () => {
// Caso de teste: valida um comportamento específico e suas expectativas.
    it('cria sala e mestre atomicamente, repetindo código de convite em colisão', async () => {
// Constante ou estado local: `database` mantém o dado necessário ao fluxo abaixo.
        const database = new FakeDatabase();
        makeRoom(database, { code: 'COLLISION' });
// Constante ou estado local: `codes` mantém o dado necessário ao fluxo abaixo.
        const codes = ['COLLISION', 'UNIQUECODE'];
// Constante ou estado local: `service` mantém o dado necessário ao fluxo abaixo.
        const service = new RoomsService(database.pool, () => {
// Constante ou estado local: `next` mantém o dado necessário ao fluxo abaixo.
            const next = codes.shift();
// Condição: altera o caminho de execução somente quando a regra indicada é verdadeira.
            if (!next) throw new Error('Código de teste indisponível.');
            return next;
        });
// Constante ou estado local: `userId` mantém o dado necessário ao fluxo abaixo.
        const userId = randomUUID();

// Constante ou estado local: `room` mantém o dado necessário ao fluxo abaixo.
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

// Caso de teste: valida um comportamento específico e suas expectativas.
    it('faz rollback da sala quando não consegue criar o participante mestre', async () => {
// Constante ou estado local: `database` mantém o dado necessário ao fluxo abaixo.
        const database = new FakeDatabase();
        database.failParticipantInsert = true;
// Constante ou estado local: `service` mantém o dado necessário ao fluxo abaixo.
        const service = new RoomsService(database.pool, () => 'UNIQUECODE');

        await assert.rejects(service.createRoom('Campanha', randomUUID()), /participant insert failed/);
        assert.equal(database.rooms.length, 0);
        assert.equal(database.participants.length, 0);
        assert.equal(database.transactionCommitted, false);
        assert.equal(database.transactionRolledBack, true);
    });

// Caso de teste: valida um comportamento específico e suas expectativas.
    it('lista salas por participação, inclusive quando o usuário não é criador', async () => {
// Constante ou estado local: `database` mantém o dado necessário ao fluxo abaixo.
        const database = new FakeDatabase();
// Constante ou estado local: `room` mantém o dado necessário ao fluxo abaixo.
        const room = makeRoom(database);
// Constante ou estado local: `userId` mantém o dado necessário ao fluxo abaixo.
        const userId = randomUUID();
        database.participants.push(makeParticipant(room, userId));
// Constante ou estado local: `service` mantém o dado necessário ao fluxo abaixo.
        const service = new RoomsService(database.pool);

// Constante ou estado local: `rooms` mantém o dado necessário ao fluxo abaixo.
        const rooms = await service.listRooms(userId);

        assert.deepEqual(rooms.map((entry) => entry.id), [room.id]);
        assert.notEqual(rooms[0]?.criadorId, userId);
    });

// Caso de teste: valida um comportamento específico e suas expectativas.
    it('associa usuário à sala ativa como jogador', async () => {
// Constante ou estado local: `database` mantém o dado necessário ao fluxo abaixo.
        const database = new FakeDatabase();
// Constante ou estado local: `room` mantém o dado necessário ao fluxo abaixo.
        const room = makeRoom(database);
// Constante ou estado local: `userId` mantém o dado necessário ao fluxo abaixo.
        const userId = randomUUID();
// Constante ou estado local: `service` mantém o dado necessário ao fluxo abaixo.
        const service = new RoomsService(database.pool);

// Constante ou estado local: `participant` mantém o dado necessário ao fluxo abaixo.
        const participant = await service.joinRoom(room.codigo_convite, userId);

        assert.equal(participant.salaId, room.id);
        assert.equal(participant.usuarioId, userId);
        assert.equal(participant.papel, ParticipantRole.JOGADOR);
        assert.deepEqual(participant.preferenciasView, { zoom: 1, panX: 0, panY: 0 });
        assert.equal(database.transactionCommitted, true);
    });

// Caso de teste: valida um comportamento específico e suas expectativas.
    it('rejeita código inexistente e sala inativa com erros previsíveis', async () => {
// Constante ou estado local: `database` mantém o dado necessário ao fluxo abaixo.
        const database = new FakeDatabase();
// Constante ou estado local: `service` mantém o dado necessário ao fluxo abaixo.
        const service = new RoomsService(database.pool);
        await assert.rejects(
            service.joinRoom('MISSING1', randomUUID()),
            (error: unknown) => error instanceof HttpError
                && error.statusCode === 404 && error.code === 'ROOM_NOT_FOUND',
        );

// Constante ou estado local: `inactiveRoom` mantém o dado necessário ao fluxo abaixo.
        const inactiveRoom = makeRoom(database, { status: RoomStatus.PAUSADA });
        await assert.rejects(
            service.joinRoom(inactiveRoom.codigo_convite, randomUUID()),
            (error: unknown) => error instanceof HttpError
                && error.statusCode === 409 && error.code === 'ROOM_INACTIVE',
        );
    });

// Caso de teste: valida um comportamento específico e suas expectativas.
    it('converte a violação da constraint de participação duplicada em conflito', async () => {
// Constante ou estado local: `database` mantém o dado necessário ao fluxo abaixo.
        const database = new FakeDatabase();
// Constante ou estado local: `room` mantém o dado necessário ao fluxo abaixo.
        const room = makeRoom(database);
// Constante ou estado local: `userId` mantém o dado necessário ao fluxo abaixo.
        const userId = randomUUID();
        database.participants.push(makeParticipant(room, userId));
// Constante ou estado local: `service` mantém o dado necessário ao fluxo abaixo.
        const service = new RoomsService(database.pool);

        await assert.rejects(
            service.joinRoom(room.codigo_convite, userId),
            (error: unknown) => error instanceof HttpError
                && error.statusCode === 409 && error.code === 'ALREADY_PARTICIPANT',
        );
    });

// Caso de teste: valida um comportamento específico e suas expectativas.
    it('retorna sala e participantes para membro e não consulta dados para usuário externo', async () => {
// Constante ou estado local: `database` mantém o dado necessário ao fluxo abaixo.
        const database = new FakeDatabase();
// Constante ou estado local: `room` mantém o dado necessário ao fluxo abaixo.
        const room = makeRoom(database);
// Constante ou estado local: `memberId` mantém o dado necessário ao fluxo abaixo.
        const memberId = randomUUID();
// Constante ou estado local: `outsiderId` mantém o dado necessário ao fluxo abaixo.
        const outsiderId = randomUUID();
        database.participants.push(makeParticipant(room, memberId, ParticipantRole.MESTRE));
        database.participants.push(makeParticipant(room, randomUUID()));
// Constante ou estado local: `service` mantém o dado necessário ao fluxo abaixo.
        const service = new RoomsService(database.pool);

// Constante ou estado local: `lobby` mantém o dado necessário ao fluxo abaixo.
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
