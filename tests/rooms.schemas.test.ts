import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { roomSchema } from '@motor-vtt/contracts';

import {
    createRoomSchema,
    joinRoomSchema,
    roomIdParamsSchema,
} from '../src/routes/rooms.schemas.js';

describe('contratos de entrada de salas', () => {
    it('aceita apenas o nome na criação e mantém os campos gerados pelo backend fora da entrada', () => {
        assert.equal(createRoomSchema.safeParse({ nome: '  Campanha  ' }).success, true);
        assert.equal(createRoomSchema.safeParse({}).success, false);
        assert.equal(createRoomSchema.safeParse({ nome: '   ' }).success, false);

        for (const field of ['criadorId', 'papel', 'status', 'codigoConvite']) {
            assert.equal(
                createRoomSchema.safeParse({ nome: 'Campanha', [field]: 'valor' }).success,
                false,
                `${field} não deve ser aceito na criação`,
            );
        }

        assert.equal(roomSchema.shape.criadorId.safeParse(
            '550e8400-e29b-41d4-a716-446655440000',
        ).success, true);
    });

    it('exige um código de convite válido para a entrada', () => {
        assert.equal(joinRoomSchema.safeParse({ codigoConvite: 'ABC123' }).success, true);
        assert.equal(joinRoomSchema.safeParse({}).success, false);
        assert.equal(joinRoomSchema.safeParse({ codigoConvite: '123' }).success, false);
    });

    it('exige UUID válido para o identificador da sala', () => {
        assert.equal(roomIdParamsSchema.safeParse({
            salaId: '550e8400-e29b-41d4-a716-446655440000',
        }).success, true);
        assert.equal(roomIdParamsSchema.safeParse({ salaId: 'nao-e-uuid' }).success, false);
        assert.equal(roomIdParamsSchema.safeParse({}).success, false);
    });
});
