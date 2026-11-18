/** Calcula rolagens de dados no servidor usando aleatoriedade criptográfica. */
// Importações: reúnem bibliotecas, tipos e módulos locais usados pelos blocos seguintes.
import { randomInt as secureRandomInt } from 'node:crypto';

// Exportação principal: `MAX_DICE_PER_ROLL` disponibiliza esta responsabilidade para os consumidores deste módulo.
export const MAX_DICE_PER_ROLL = 100;
// Exportação principal: `MAX_REPETITIONS` disponibiliza esta responsabilidade para os consumidores deste módulo.
export const MAX_REPETITIONS = 100;
// Exportação principal: `MAX_DIE_SIDES` disponibiliza esta responsabilidade para os consumidores deste módulo.
export const MAX_DIE_SIDES = 1_000_000;
// Exportação principal: `MAX_EXPLOSIONS_PER_DIE` disponibiliza esta responsabilidade para os consumidores deste módulo.
export const MAX_EXPLOSIONS_PER_DIE = 100;

// Exportação principal: `DiceSyntaxError` disponibiliza esta responsabilidade para os consumidores deste módulo.
export class DiceSyntaxError extends Error {
    public constructor(message: string) {
        super(message);
        this.name = 'DiceSyntaxError';
    }
}

// Exportação principal: `DiceRandomInt` disponibiliza esta responsabilidade para os consumidores deste módulo.
export type DiceRandomInt = (max: number) => number;

// Tipo: `DiceArithmeticModifier` descreve o formato estruturado usado nas operações relacionadas.
type DiceArithmeticModifier = {
    kind: 'TOTAL' | 'PER_DIE' | 'SUCCESS';
    operator: '+' | '-' | '++' | '--' | '>>' | '<<';
    value: number;
};

// Tipo: `DiceRollModifiers` descreve o formato estruturado usado nas operações relacionadas.
interface DiceRollModifiers {
    exploding: boolean;
    noSort: boolean;
    arithmetic: DiceArithmeticModifier | null;
}

// Tipo: `DiceRollDieResult` descreve o formato estruturado usado nas operações relacionadas.
interface DiceRollDieResult {
    rolls: number[];
    modifiedRolls: number[];
    rawTotal: number;
    modifiedTotal: number;
    explosionLimitReached: boolean;
}

// Tipo: `DiceRollRepetitionResult` descreve o formato estruturado usado nas operações relacionadas.
interface DiceRollRepetitionResult {
    repetition: number;
    dice: DiceRollDieResult[];
    rawRolls: number[];
    displayRolls: number[];
    modifiedRolls: number[];
    displayModifiedRolls: number[];
    total: number | null;
    successes: number | null;
    explosionLimitReached: boolean;
}

// Exportação principal: `DiceRollResult` disponibiliza esta responsabilidade para os consumidores deste módulo.
export interface DiceRollResult {
    expression: string;
    repetitionCount: number;
    dicePerRepetition: number;
    sides: number;
    modifiers: DiceRollModifiers;
    repetitions: DiceRollRepetitionResult[];
}

// Exportação principal: `ParsedDiceExpression` disponibiliza esta responsabilidade para os consumidores deste módulo.
export interface ParsedDiceExpression {
    expression: string;
    repetitionCount: number;
    dicePerRepetition: number;
    sides: number;
    modifiers: DiceRollModifiers;
}

// Bloco local: `positiveInteger` concentra uma responsabilidade reutilizada dentro deste módulo.
function positiveInteger(value: string, label: string): number {
// Constante ou estado local: `parsed` mantém o dado necessário ao fluxo abaixo.
    const parsed = Number(value);
// Condição: altera o caminho de execução somente quando a regra indicada é verdadeira.
    if (!Number.isSafeInteger(parsed) || parsed < 1) {
        throw new DiceSyntaxError(`${label} deve ser um inteiro positivo.`);
    }
    return parsed;
}

// Bloco local: `safeInteger` concentra uma responsabilidade reutilizada dentro deste módulo.
function safeInteger(value: string, label: string): number {
// Constante ou estado local: `parsed` mantém o dado necessário ao fluxo abaixo.
    const parsed = Number(value);
// Condição: altera o caminho de execução somente quando a regra indicada é verdadeira.
    if (!Number.isSafeInteger(parsed)) {
        throw new DiceSyntaxError(`${label} deve ser um inteiro seguro.`);
    }
    return parsed;
}

// Exportação principal: `parseDiceExpression` disponibiliza esta responsabilidade para os consumidores deste módulo.
export function parseDiceExpression(expression: string): ParsedDiceExpression {
// Condição: altera o caminho de execução somente quando a regra indicada é verdadeira.
    if (typeof expression !== 'string' || expression.length === 0 || expression.length > 1000) {
        throw new DiceSyntaxError('A expressão de rolagem é inválida.');
    }

// Constante ou estado local: `match` mantém o dado necessário ao fluxo abaixo.
    const match = /^(?:(\d+)#)?(\d*)[dD](\d+)(!)?(ns)?(?:[ \n\r]*(\+\+|--|>>|<<)[ \n\r]*(-?\d+)|[ \n\r]*([+-])[ \n\r]*(\d+))?$/.exec(expression);
// Condição: altera o caminho de execução somente quando a regra indicada é verdadeira.
    if (!match) throw new DiceSyntaxError('Sintaxe de rolagem inválida.');

// Constante ou estado local: `repetitionCount` mantém o dado necessário ao fluxo abaixo.
    const repetitionCount = match[1] === undefined ? 1 : positiveInteger(match[1], 'Repetições');
// Constante ou estado local: `dicePerRepetition` mantém o dado necessário ao fluxo abaixo.
    const dicePerRepetition = match[2] === '' ? 1 : positiveInteger(match[2] as string, 'Dados');
// Constante ou estado local: `sides` mantém o dado necessário ao fluxo abaixo.
    const sides = positiveInteger(match[3] as string, 'Faces');

// Condição: altera o caminho de execução somente quando a regra indicada é verdadeira.
    if (repetitionCount > MAX_REPETITIONS) {
        throw new DiceSyntaxError(`O limite é ${MAX_REPETITIONS} repetições.`);
    }
// Condição: altera o caminho de execução somente quando a regra indicada é verdadeira.
    if (dicePerRepetition * repetitionCount > MAX_DICE_PER_ROLL) {
        throw new DiceSyntaxError(`O limite é ${MAX_DICE_PER_ROLL} dados totais por rolagem.`);
    }
// Condição: altera o caminho de execução somente quando a regra indicada é verdadeira.
    if (sides < 2) throw new DiceSyntaxError('Dados de uma face não são permitidos.');
// Condição: altera o caminho de execução somente quando a regra indicada é verdadeira.
    if (sides > MAX_DIE_SIDES) {
        throw new DiceSyntaxError(`O limite é ${MAX_DIE_SIDES} faces por dado.`);
    }

    let arithmetic: DiceRollModifiers['arithmetic'] = null;
// Constante ou estado local: `operator` mantém o dado necessário ao fluxo abaixo.
    const operator = match[6];
// Condição: altera o caminho de execução somente quando a regra indicada é verdadeira.
    if (operator !== undefined) {
// Constante ou estado local: `value` mantém o dado necessário ao fluxo abaixo.
        const value = safeInteger(match[7] as string, 'Modificador');
        arithmetic = {
            kind: operator === '++' || operator === '--' ? 'PER_DIE' : 'SUCCESS',
            operator: operator as DiceArithmeticModifier['operator'],
            value,
        };
    } else if (match[8] !== undefined) {
// Constante ou estado local: `value` mantém o dado necessário ao fluxo abaixo.
        const value = safeInteger(match[9] as string, 'Modificador');
        arithmetic = {
            kind: 'TOTAL',
            operator: match[8] as '+' | '-',
            value,
        };
    }

    return {
        expression,
        repetitionCount,
        dicePerRepetition,
        sides,
        modifiers: {
            exploding: match[4] === '!',
            noSort: match[5] === 'ns',
            arithmetic,
        },
    };
}

// Exportação principal: `isDiceExpressionCandidate` disponibiliza esta responsabilidade para os consumidores deste módulo.
export function isDiceExpressionCandidate(content: string): boolean {
    return /^\d+#/.test(content)
        || /^\d+d/i.test(content)
        || /^d(?=$|[\d!ns+\-<> ])/i.test(content);
}

// Bloco local: `safeSum` concentra uma responsabilidade reutilizada dentro deste módulo.
function safeSum(values: readonly number[]): number {
// Constante ou estado local: `total` mantém o dado necessário ao fluxo abaixo.
    let total = 0;
// Iteração: processa repetidamente os elementos ou tentativas deste bloco.
    for (const value of values) {
        total += value;
// Condição: altera o caminho de execução somente quando a regra indicada é verdadeira.
        if (!Number.isSafeInteger(total)) {
            throw new DiceSyntaxError('O resultado excede o limite numérico seguro.');
        }
    }
    return total;
}

// Bloco local: `modifiedValue` concentra uma responsabilidade reutilizada dentro deste módulo.
function modifiedValue(value: number, parsed: ParsedDiceExpression): number {
// Constante ou estado local: `modifier` mantém o dado necessário ao fluxo abaixo.
    const modifier = parsed.modifiers.arithmetic;
// Condição: altera o caminho de execução somente quando a regra indicada é verdadeira.
    if (modifier?.kind !== 'PER_DIE') return value;
// Constante ou estado local: `result` mantém o dado necessário ao fluxo abaixo.
    const result = modifier.operator === '++'
        ? value + modifier.value
        : value - modifier.value;
// Condição: altera o caminho de execução somente quando a regra indicada é verdadeira.
    if (!Number.isSafeInteger(result)) {
        throw new DiceSyntaxError('O modificador excede o limite numérico seguro.');
    }
    return result;
}

// Bloco local: `rollOneDie` concentra uma responsabilidade reutilizada dentro deste módulo.
function rollOneDie(
    sides: number,
    exploding: boolean,
    randomInt: DiceRandomInt,
    parsed: ParsedDiceExpression,
): DiceRollDieResult {
    const rolls: number[] = [];
// Constante ou estado local: `explosions` mantém o dado necessário ao fluxo abaixo.
    let explosions = 0;
// Constante ou estado local: `explosionLimitReached` mantém o dado necessário ao fluxo abaixo.
    let explosionLimitReached = false;

// Repetição: mantém o fluxo enquanto a condição continuar verdadeira.
    while (true) {
// Constante ou estado local: `randomValue` mantém o dado necessário ao fluxo abaixo.
        const randomValue = randomInt(sides);
// Condição: altera o caminho de execução somente quando a regra indicada é verdadeira.
        if (!Number.isInteger(randomValue) || randomValue < 0 || randomValue >= sides) {
            throw new Error('O gerador aleatório retornou um valor inválido.');
        }
// Constante ou estado local: `value` mantém o dado necessário ao fluxo abaixo.
        const value = randomValue + 1;
        rolls.push(value);
// Condição: altera o caminho de execução somente quando a regra indicada é verdadeira.
        if (!exploding || value !== sides) break;
// Condição: altera o caminho de execução somente quando a regra indicada é verdadeira.
        if (explosions === MAX_EXPLOSIONS_PER_DIE) {
            explosionLimitReached = true;
            break;
        }
        explosions += 1;
    }

// Constante ou estado local: `modifiedRolls` mantém o dado necessário ao fluxo abaixo.
    const modifiedRolls = rolls.map((value) => modifiedValue(value, parsed));
    return {
        rolls,
        modifiedRolls,
        rawTotal: safeSum(rolls),
        modifiedTotal: safeSum(modifiedRolls),
        explosionLimitReached,
    };
}

// Bloco local: `createRepetition` concentra uma responsabilidade reutilizada dentro deste módulo.
function createRepetition(
    repetition: number,
    parsed: ParsedDiceExpression,
    randomInt: DiceRandomInt,
): DiceRollRepetitionResult {
    const dice: DiceRollDieResult[] = [];
// Iteração: processa repetidamente os elementos ou tentativas deste bloco.
    for (let die = 0; die < parsed.dicePerRepetition; die += 1) {
        dice.push(rollOneDie(parsed.sides, parsed.modifiers.exploding, randomInt, parsed));
    }

// Constante ou estado local: `rawRolls` mantém o dado necessário ao fluxo abaixo.
    const rawRolls = dice.flatMap((die) => die.rolls);
// Constante ou estado local: `modifiedRolls` mantém o dado necessário ao fluxo abaixo.
    const modifiedRolls = dice.flatMap((die) => die.modifiedRolls);
// Constante ou estado local: `displayRolls` mantém o dado necessário ao fluxo abaixo.
    const displayRolls = parsed.modifiers.noSort
        ? [...rawRolls]
        : [...rawRolls].sort((left, right) => right - left);
// Constante ou estado local: `displayModifiedRolls` mantém o dado necessário ao fluxo abaixo.
    const displayModifiedRolls = parsed.modifiers.noSort
        ? [...modifiedRolls]
        : [...modifiedRolls].sort((left, right) => right - left);
// Constante ou estado local: `modifier` mantém o dado necessário ao fluxo abaixo.
    const modifier = parsed.modifiers.arithmetic;
    let total: number | null = null;
    let successes: number | null = null;

// Condição: altera o caminho de execução somente quando a regra indicada é verdadeira.
    if (modifier?.kind === 'SUCCESS') {
        successes = modifiedRolls.filter((value) => (
            modifier.operator === '>>' ? value >= modifier.value : value <= modifier.value
        )).length;
    } else {
// Constante ou estado local: `diceTotal` mantém o dado necessário ao fluxo abaixo.
        const diceTotal = safeSum(modifiedRolls);
        total = modifier?.kind === 'TOTAL'
            ? diceTotal + (modifier.operator === '+' ? modifier.value : -modifier.value)
            : diceTotal;
// Condição: altera o caminho de execução somente quando a regra indicada é verdadeira.
        if (!Number.isSafeInteger(total)) {
            throw new DiceSyntaxError('O total excede o limite numérico seguro.');
        }
    }

    return {
        repetition,
        dice,
        rawRolls,
        displayRolls,
        modifiedRolls,
        displayModifiedRolls,
        total,
        successes,
        explosionLimitReached: dice.some((die) => die.explosionLimitReached),
    };
}

// Exportação principal: `rollDiceExpression` disponibiliza esta responsabilidade para os consumidores deste módulo.
export function rollDiceExpression(
    expression: string,
    randomInt: DiceRandomInt = secureRandomInt,
): DiceRollResult {
// Constante ou estado local: `parsed` mantém o dado necessário ao fluxo abaixo.
    const parsed = parseDiceExpression(expression);
    const repetitions: DiceRollRepetitionResult[] = [];
// Iteração: processa repetidamente os elementos ou tentativas deste bloco.
    for (let index = 1; index <= parsed.repetitionCount; index += 1) {
        repetitions.push(createRepetition(index, parsed, randomInt));
    }
    return {
        ...parsed,
        repetitions,
    };
}
