import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
    DiceSyntaxError,
    MAX_DICE_PER_ROLL,
    MAX_EXPLOSIONS_PER_DIE,
    MAX_REPETITIONS,
    isDiceExpressionCandidate,
    parseDiceExpression,
    rollDiceExpression,
} from '../src/services/dice-roller.js';

function queuedRandom(values: number[]): (max: number) => number {
    let index = 0;
    return (max) => {
        const value = values[index] ?? 0;
        index += 1;
        assert.ok(value >= 0 && value < max, `valor aleatório ${value} fora do limite ${max}`);
        return value;
    };
}

describe('parser e execução da sintaxe V1 de dados', () => {
    it('calcula modificador total em 2d4+2 e omite a quantidade como 1 em d20', () => {
        const modified = rollDiceExpression('2d4+2', queuedRandom([0, 3]));
        assert.equal(modified.repetitions[0]?.total, 7);
        assert.deepEqual(modified.repetitions[0]?.rawRolls, [1, 4]);
        assert.equal(parseDiceExpression('d20').dicePerRepetition, 1);
        assert.equal(rollDiceExpression('d20', queuedRandom([19])).repetitions[0]?.total, 20);
    });

    it('cria repetições independentes sem total global', () => {
        const result = rollDiceExpression('3#5d20', queuedRandom([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]));
        assert.equal(result.repetitions.length, 3);
        assert.deepEqual(result.repetitions.map((repeat) => repeat.dice.length), [5, 5, 5]);
        assert.deepEqual(result.repetitions.map((repeat) => repeat.rawRolls), [
            [1, 2, 3, 4, 5],
            [6, 7, 8, 9, 10],
            [11, 12, 13, 14, 15],
        ]);
        assert.deepEqual(result.repetitions.map((repeat) => repeat.total), [15, 40, 65]);
    });

    it('ordena os resultados em ordem decrescente e preserva a ordem com ns', () => {
        assert.deepEqual(
            rollDiceExpression('3d6', queuedRandom([1, 5, 2])).repetitions[0]?.displayRolls,
            [6, 3, 2],
        );
        assert.deepEqual(
            rollDiceExpression('3d6ns', queuedRandom([1, 5, 2])).repetitions[0]?.displayRolls,
            [2, 6, 3],
        );
    });

    it('preserva cada valor explosivo, acumula a cadeia e sinaliza o limite defensivo', () => {
        const exploded = rollDiceExpression('d6!', queuedRandom([5, 5, 1])).repetitions[0];
        assert.deepEqual(exploded?.dice[0]?.rolls, [6, 6, 2]);
        assert.equal(exploded?.total, 14);
        assert.equal(exploded?.explosionLimitReached, false);

        const limited = rollDiceExpression(
            'd2!',
            () => 1,
        ).repetitions[0];
        assert.equal(limited?.dice[0]?.rolls.length, MAX_EXPLOSIONS_PER_DIE + 1);
        assert.equal(limited?.dice[0]?.explosionLimitReached, true);
        assert.equal(limited?.explosionLimitReached, true);
    });

    it('aplica ++Z e --Z a cada resultado individual', () => {
        const plus = rollDiceExpression('2d4++2', queuedRandom([0, 3])).repetitions[0];
        const minus = rollDiceExpression('2d4--2', queuedRandom([0, 3])).repetitions[0];
        assert.deepEqual(plus?.modifiedRolls, [3, 6]);
        assert.equal(plus?.total, 9);
        assert.deepEqual(minus?.modifiedRolls, [-1, 2]);
        assert.equal(minus?.total, 1);
    });

    it('conta sucessos inclusivos nos limites de >>Z e <<Z', () => {
        const dice = [2, 3, 4];
        const atLeast = rollDiceExpression('3d4>>3', queuedRandom(dice.map((value) => value - 1)))
            .repetitions[0];
        const atMost = rollDiceExpression('3d4<<3', queuedRandom(dice.map((value) => value - 1)))
            .repetitions[0];
        assert.equal(atLeast?.successes, 2);
        assert.equal(atLeast?.total, null);
        assert.equal(atMost?.successes, 2);
        assert.equal(atMost?.total, null);
    });

    it('permite espaços em torno dos operadores como na gramática V1', () => {
        const result = rollDiceExpression('2d4 ++ 2', queuedRandom([0, 3])).repetitions[0];
        assert.deepEqual(result?.modifiedRolls, [3, 6]);
        assert.equal(result?.total, 9);
    });

    it('aceita exatamente os limites de repetição e dados totais', () => {
        assert.equal(
            rollDiceExpression(`${MAX_DICE_PER_ROLL}d2`, () => 0).repetitions[0]?.dice.length,
            MAX_DICE_PER_ROLL,
        );
        assert.equal(
            rollDiceExpression(`${MAX_REPETITIONS}#d2`, () => 0).repetitions.length,
            MAX_REPETITIONS,
        );
    });

    it('rejeita limites excedidos, dados de uma face e expressões fora do escopo', () => {
        for (const expression of [
            '101#d6',
            '101d6',
            '2#51d6',
            'd1',
            'd6!2',
            '2d4kh1',
            'd20+',
            '3##d20',
            'd20 trailing',
            ' d20',
        ]) {
            assert.throws(() => parseDiceExpression(expression), DiceSyntaxError, expression);
        }
    });

    it('identifica candidatos malformados sem transformar texto comum em rolagem', () => {
        assert.equal(parseDiceExpression('d20').expression, 'd20');
        assert.throws(() => parseDiceExpression('2d4++'), DiceSyntaxError);
        assert.equal(isDiceExpressionCandidate('2d4++'), true);
        assert.equal(isDiceExpressionCandidate('2d'), true);
        assert.equal(isDiceExpressionCandidate('3##d20'), true);
        assert.equal(isDiceExpressionCandidate('2dfoo'), true);
        assert.equal(isDiceExpressionCandidate('vamos rolar d20'), false);
        assert.equal(isDiceExpressionCandidate('dinner is ready'), false);
    });
});
