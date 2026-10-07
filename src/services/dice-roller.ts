import { randomInt as secureRandomInt } from 'node:crypto';

export const MAX_DICE_PER_ROLL = 100;
export const MAX_REPETITIONS = 100;
export const MAX_DIE_SIDES = 1_000_000;
export const MAX_EXPLOSIONS_PER_DIE = 100;

export class DiceSyntaxError extends Error {
    public constructor(message: string) {
        super(message);
        this.name = 'DiceSyntaxError';
    }
}

export type DiceRandomInt = (max: number) => number;

type DiceArithmeticModifier = {
    kind: 'TOTAL' | 'PER_DIE' | 'SUCCESS';
    operator: '+' | '-' | '++' | '--' | '>>' | '<<';
    value: number;
};

interface DiceRollModifiers {
    exploding: boolean;
    noSort: boolean;
    arithmetic: DiceArithmeticModifier | null;
}

interface DiceRollDieResult {
    rolls: number[];
    modifiedRolls: number[];
    rawTotal: number;
    modifiedTotal: number;
    explosionLimitReached: boolean;
}

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

export interface DiceRollResult {
    expression: string;
    repetitionCount: number;
    dicePerRepetition: number;
    sides: number;
    modifiers: DiceRollModifiers;
    repetitions: DiceRollRepetitionResult[];
}

export interface ParsedDiceExpression {
    expression: string;
    repetitionCount: number;
    dicePerRepetition: number;
    sides: number;
    modifiers: DiceRollModifiers;
}

function positiveInteger(value: string, label: string): number {
    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed) || parsed < 1) {
        throw new DiceSyntaxError(`${label} deve ser um inteiro positivo.`);
    }
    return parsed;
}

function safeInteger(value: string, label: string): number {
    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed)) {
        throw new DiceSyntaxError(`${label} deve ser um inteiro seguro.`);
    }
    return parsed;
}

export function parseDiceExpression(expression: string): ParsedDiceExpression {
    if (typeof expression !== 'string' || expression.length === 0 || expression.length > 1000) {
        throw new DiceSyntaxError('A expressão de rolagem é inválida.');
    }

    const match = /^(?:(\d+)#)?(\d*)[dD](\d+)(!)?(ns)?(?:[ \n\r]*(\+\+|--|>>|<<)[ \n\r]*(-?\d+)|[ \n\r]*([+-])[ \n\r]*(\d+))?$/.exec(expression);
    if (!match) throw new DiceSyntaxError('Sintaxe de rolagem inválida.');

    const repetitionCount = match[1] === undefined ? 1 : positiveInteger(match[1], 'Repetições');
    const dicePerRepetition = match[2] === '' ? 1 : positiveInteger(match[2] as string, 'Dados');
    const sides = positiveInteger(match[3] as string, 'Faces');

    if (repetitionCount > MAX_REPETITIONS) {
        throw new DiceSyntaxError(`O limite é ${MAX_REPETITIONS} repetições.`);
    }
    if (dicePerRepetition * repetitionCount > MAX_DICE_PER_ROLL) {
        throw new DiceSyntaxError(`O limite é ${MAX_DICE_PER_ROLL} dados totais por rolagem.`);
    }
    if (sides < 2) throw new DiceSyntaxError('Dados de uma face não são permitidos.');
    if (sides > MAX_DIE_SIDES) {
        throw new DiceSyntaxError(`O limite é ${MAX_DIE_SIDES} faces por dado.`);
    }

    let arithmetic: DiceRollModifiers['arithmetic'] = null;
    const operator = match[6];
    if (operator !== undefined) {
        const value = safeInteger(match[7] as string, 'Modificador');
        arithmetic = {
            kind: operator === '++' || operator === '--' ? 'PER_DIE' : 'SUCCESS',
            operator: operator as DiceArithmeticModifier['operator'],
            value,
        };
    } else if (match[8] !== undefined) {
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

export function isDiceExpressionCandidate(content: string): boolean {
    return /^\d+#/.test(content)
        || /^\d+d/i.test(content)
        || /^d(?=$|[\d!ns+\-<> ])/i.test(content);
}

function safeSum(values: readonly number[]): number {
    let total = 0;
    for (const value of values) {
        total += value;
        if (!Number.isSafeInteger(total)) {
            throw new DiceSyntaxError('O resultado excede o limite numérico seguro.');
        }
    }
    return total;
}

function modifiedValue(value: number, parsed: ParsedDiceExpression): number {
    const modifier = parsed.modifiers.arithmetic;
    if (modifier?.kind !== 'PER_DIE') return value;
    const result = modifier.operator === '++'
        ? value + modifier.value
        : value - modifier.value;
    if (!Number.isSafeInteger(result)) {
        throw new DiceSyntaxError('O modificador excede o limite numérico seguro.');
    }
    return result;
}

function rollOneDie(
    sides: number,
    exploding: boolean,
    randomInt: DiceRandomInt,
    parsed: ParsedDiceExpression,
): DiceRollDieResult {
    const rolls: number[] = [];
    let explosions = 0;
    let explosionLimitReached = false;

    while (true) {
        const randomValue = randomInt(sides);
        if (!Number.isInteger(randomValue) || randomValue < 0 || randomValue >= sides) {
            throw new Error('O gerador aleatório retornou um valor inválido.');
        }
        const value = randomValue + 1;
        rolls.push(value);
        if (!exploding || value !== sides) break;
        if (explosions === MAX_EXPLOSIONS_PER_DIE) {
            explosionLimitReached = true;
            break;
        }
        explosions += 1;
    }

    const modifiedRolls = rolls.map((value) => modifiedValue(value, parsed));
    return {
        rolls,
        modifiedRolls,
        rawTotal: safeSum(rolls),
        modifiedTotal: safeSum(modifiedRolls),
        explosionLimitReached,
    };
}

function createRepetition(
    repetition: number,
    parsed: ParsedDiceExpression,
    randomInt: DiceRandomInt,
): DiceRollRepetitionResult {
    const dice: DiceRollDieResult[] = [];
    for (let die = 0; die < parsed.dicePerRepetition; die += 1) {
        dice.push(rollOneDie(parsed.sides, parsed.modifiers.exploding, randomInt, parsed));
    }

    const rawRolls = dice.flatMap((die) => die.rolls);
    const modifiedRolls = dice.flatMap((die) => die.modifiedRolls);
    const displayRolls = parsed.modifiers.noSort
        ? [...rawRolls]
        : [...rawRolls].sort((left, right) => right - left);
    const displayModifiedRolls = parsed.modifiers.noSort
        ? [...modifiedRolls]
        : [...modifiedRolls].sort((left, right) => right - left);
    const modifier = parsed.modifiers.arithmetic;
    let total: number | null = null;
    let successes: number | null = null;

    if (modifier?.kind === 'SUCCESS') {
        successes = modifiedRolls.filter((value) => (
            modifier.operator === '>>' ? value >= modifier.value : value <= modifier.value
        )).length;
    } else {
        const diceTotal = safeSum(modifiedRolls);
        total = modifier?.kind === 'TOTAL'
            ? diceTotal + (modifier.operator === '+' ? modifier.value : -modifier.value)
            : diceTotal;
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

export function rollDiceExpression(
    expression: string,
    randomInt: DiceRandomInt = secureRandomInt,
): DiceRollResult {
    const parsed = parseDiceExpression(expression);
    const repetitions: DiceRollRepetitionResult[] = [];
    for (let index = 1; index <= parsed.repetitionCount; index += 1) {
        repetitions.push(createRepetition(index, parsed, randomInt));
    }
    return {
        ...parsed,
        repetitions,
    };
}
