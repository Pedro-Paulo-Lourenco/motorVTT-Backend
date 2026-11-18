/** Verifica parsing, limites e resultados do serviço de rolagem. */
// Importações: reúnem bibliotecas, tipos e módulos locais usados pelos blocos seguintes.
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

// Bloco local: `queuedRandom` concentra uma responsabilidade reutilizada dentro deste módulo.
function queuedRandom(values: number[]): (max: number) => number {
// Constante ou estado local: `index` mantém o dado necessário ao fluxo abaixo.
    let index = 0;
    return (max) => {
// Constante ou estado local: `value` mantém o dado necessário ao fluxo abaixo.
        const value = values[index] ?? 0;
        index += 1;
        assert.ok(value >= 0 && value < max, `valor aleatório ${value} fora do limite ${max}`);
        return value;
    };
}

// Grupo de testes: reúne cenários que exercitam uma mesma área do comportamento.
describe('parser e execução da sintaxe V1 de dados', () => {
// Caso de teste: valida um comportamento específico e suas expectativas.
    it('calcula modificador total em 2d4+2 e omite a quantidade como 1 em d20', () => {
// Constante ou estado local: `modified` mantém o dado necessário ao fluxo abaixo.
        const modified = rollDiceExpression('2d4+2', queuedRandom([0, 3]));
        assert.equal(modified.repetitions[0]?.total, 7);
        assert.deepEqual(modified.repetitions[0]?.rawRolls, [1, 4]);
        assert.equal(parseDiceExpression('d20').dicePerRepetition, 1);
        assert.equal(rollDiceExpression('d20', queuedRandom([19])).repetitions[0]?.total, 20);
    });

// Caso de teste: valida um comportamento específico e suas expectativas.
    it('cria repetições independentes sem total global', () => {
// Constante ou estado local: `result` mantém o dado necessário ao fluxo abaixo.
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

// Caso de teste: valida um comportamento específico e suas expectativas.
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

// Caso de teste: valida um comportamento específico e suas expectativas.
    it('preserva cada valor explosivo, acumula a cadeia e sinaliza o limite defensivo', () => {
// Constante ou estado local: `exploded` mantém o dado necessário ao fluxo abaixo.
        const exploded = rollDiceExpression('d6!', queuedRandom([5, 5, 1])).repetitions[0];
        assert.deepEqual(exploded?.dice[0]?.rolls, [6, 6, 2]);
        assert.equal(exploded?.total, 14);
        assert.equal(exploded?.explosionLimitReached, false);

// Constante ou estado local: `limited` mantém o dado necessário ao fluxo abaixo.
        const limited = rollDiceExpression(
            'd2!',
            () => 1,
        ).repetitions[0];
        assert.equal(limited?.dice[0]?.rolls.length, MAX_EXPLOSIONS_PER_DIE + 1);
        assert.equal(limited?.dice[0]?.explosionLimitReached, true);
        assert.equal(limited?.explosionLimitReached, true);
    });

// Caso de teste: valida um comportamento específico e suas expectativas.
    it('aplica ++Z e --Z a cada resultado individual', () => {
// Constante ou estado local: `plus` mantém o dado necessário ao fluxo abaixo.
        const plus = rollDiceExpression('2d4++2', queuedRandom([0, 3])).repetitions[0];
// Constante ou estado local: `minus` mantém o dado necessário ao fluxo abaixo.
        const minus = rollDiceExpression('2d4--2', queuedRandom([0, 3])).repetitions[0];
        assert.deepEqual(plus?.modifiedRolls, [3, 6]);
        assert.equal(plus?.total, 9);
        assert.deepEqual(minus?.modifiedRolls, [-1, 2]);
        assert.equal(minus?.total, 1);
    });

// Caso de teste: valida um comportamento específico e suas expectativas.
    it('conta sucessos inclusivos nos limites de >>Z e <<Z', () => {
// Constante ou estado local: `dice` mantém o dado necessário ao fluxo abaixo.
        const dice = [2, 3, 4];
// Constante ou estado local: `atLeast` mantém o dado necessário ao fluxo abaixo.
        const atLeast = rollDiceExpression('3d4>>3', queuedRandom(dice.map((value) => value - 1)))
            .repetitions[0];
// Constante ou estado local: `atMost` mantém o dado necessário ao fluxo abaixo.
        const atMost = rollDiceExpression('3d4<<3', queuedRandom(dice.map((value) => value - 1)))
            .repetitions[0];
        assert.equal(atLeast?.successes, 2);
        assert.equal(atLeast?.total, null);
        assert.equal(atMost?.successes, 2);
        assert.equal(atMost?.total, null);
    });

// Caso de teste: valida um comportamento específico e suas expectativas.
    it('permite espaços em torno dos operadores como na gramática V1', () => {
// Constante ou estado local: `result` mantém o dado necessário ao fluxo abaixo.
        const result = rollDiceExpression('2d4 ++ 2', queuedRandom([0, 3])).repetitions[0];
        assert.deepEqual(result?.modifiedRolls, [3, 6]);
        assert.equal(result?.total, 9);
    });

// Caso de teste: valida um comportamento específico e suas expectativas.
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

// Caso de teste: valida um comportamento específico e suas expectativas.
    it('rejeita limites excedidos, dados de uma face e expressões fora do escopo', () => {
// Iteração: processa repetidamente os elementos ou tentativas deste bloco.
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

// Caso de teste: valida um comportamento específico e suas expectativas.
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
