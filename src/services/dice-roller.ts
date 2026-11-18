/** Calcula rolagens de dados no servidor usando aleatoriedade criptográfica. */
// Dependências deste módulo: cada importação fornece recursos, tipos ou integrações usados na implementação abaixo.
import { randomInt as secureRandomInt } from 'node:crypto';

// API pública do módulo: `MAX_DICE_PER_ROLL` define a interface pública consumida pelos demais módulos.
export const MAX_DICE_PER_ROLL = 100;
// API pública do módulo: `MAX_REPETITIONS` define a interface pública consumida pelos demais módulos.
export const MAX_REPETITIONS = 100;
// API pública do módulo: `MAX_DIE_SIDES` define a interface pública consumida pelos demais módulos.
export const MAX_DIE_SIDES = 1_000_000;
// API pública do módulo: `MAX_EXPLOSIONS_PER_DIE` define a interface pública consumida pelos demais módulos.
export const MAX_EXPLOSIONS_PER_DIE = 100;

// API pública do módulo: `DiceSyntaxError` define a interface pública consumida pelos demais módulos.
export class DiceSyntaxError extends Error {
    public constructor(message: string) {
        super(message);
        this.name = 'DiceSyntaxError';
    }
}

// API pública do módulo: `DiceRandomInt` define a interface pública consumida pelos demais módulos.
export type DiceRandomInt = (max: number) => number;

// Contrato de dados: `DiceArithmeticModifier` documenta o formato e o significado dos dados trocados entre as camadas relacionadas.
type DiceArithmeticModifier = {
    kind: 'TOTAL' | 'PER_DIE' | 'SUCCESS';
    operator: '+' | '-' | '++' | '--' | '>>' | '<<';
    value: number;
};

// Contrato de dados: `DiceRollModifiers` documenta o formato e o significado dos dados trocados entre as camadas relacionadas.
interface DiceRollModifiers {
    exploding: boolean;
    noSort: boolean;
    arithmetic: DiceArithmeticModifier | null;
}

// Contrato de dados: `DiceRollDieResult` documenta o formato e o significado dos dados trocados entre as camadas relacionadas.
interface DiceRollDieResult {
    rolls: number[];
    modifiedRolls: number[];
    rawTotal: number;
    modifiedTotal: number;
    explosionLimitReached: boolean;
}

// Contrato de dados: `DiceRollRepetitionResult` documenta o formato e o significado dos dados trocados entre as camadas relacionadas.
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

// API pública do módulo: `DiceRollResult` define a interface pública consumida pelos demais módulos.
export interface DiceRollResult {
    expression: string;
    repetitionCount: number;
    dicePerRepetition: number;
    sides: number;
    modifiers: DiceRollModifiers;
    repetitions: DiceRollRepetitionResult[];
}

// API pública do módulo: `ParsedDiceExpression` define a interface pública consumida pelos demais módulos.
export interface ParsedDiceExpression {
    expression: string;
    repetitionCount: number;
    dicePerRepetition: number;
    sides: number;
    modifiers: DiceRollModifiers;
}

// Função auxiliar: `positiveInteger` isola uma responsabilidade reutilizada neste módulo.
function positiveInteger(value: string, label: string): number {
// Estado intermediário: `parsed` guarda o valor que será validado, transformado ou persistido nas etapas seguintes.
    const parsed = Number(value);
// Regra de negócio: a validação abaixo decide se o fluxo pode continuar ou deve retornar antecipadamente.
    if (!Number.isSafeInteger(parsed) || parsed < 1) {
        throw new DiceSyntaxError(`${label} deve ser um inteiro positivo.`);
    }
    return parsed;
}

// Função auxiliar: `safeInteger` isola uma responsabilidade reutilizada neste módulo.
function safeInteger(value: string, label: string): number {
// Estado intermediário: `parsed` guarda o valor que será validado, transformado ou persistido nas etapas seguintes.
    const parsed = Number(value);
// Regra de negócio: a validação abaixo decide se o fluxo pode continuar ou deve retornar antecipadamente.
    if (!Number.isSafeInteger(parsed)) {
        throw new DiceSyntaxError(`${label} deve ser um inteiro seguro.`);
    }
    return parsed;
}

// API pública do módulo: `parseDiceExpression` define a interface pública consumida pelos demais módulos.
export function parseDiceExpression(expression: string): ParsedDiceExpression {
// Regra de negócio: a validação abaixo decide se o fluxo pode continuar ou deve retornar antecipadamente.
    if (typeof expression !== 'string' || expression.length === 0 || expression.length > 1000) {
        throw new DiceSyntaxError('A expressão de rolagem é inválida.');
    }

// Estado intermediário: `match` guarda o valor que será validado, transformado ou persistido nas etapas seguintes.
    const match = /^(?:(\d+)#)?(\d*)[dD](\d+)(!)?(ns)?(?:[ \n\r]*(\+\+|--|>>|<<)[ \n\r]*(-?\d+)|[ \n\r]*([+-])[ \n\r]*(\d+))?$/.exec(expression);
// Regra de negócio: a validação abaixo decide se o fluxo pode continuar ou deve retornar antecipadamente.
    if (!match) throw new DiceSyntaxError('Sintaxe de rolagem inválida.');

// Estado intermediário: `repetitionCount` guarda o valor que será validado, transformado ou persistido nas etapas seguintes.
    const repetitionCount = match[1] === undefined ? 1 : positiveInteger(match[1], 'Repetições');
// Estado intermediário: `dicePerRepetition` guarda o valor que será validado, transformado ou persistido nas etapas seguintes.
    const dicePerRepetition = match[2] === '' ? 1 : positiveInteger(match[2] as string, 'Dados');
// Estado intermediário: `sides` guarda o valor que será validado, transformado ou persistido nas etapas seguintes.
    const sides = positiveInteger(match[3] as string, 'Faces');

// Regra de negócio: a validação abaixo decide se o fluxo pode continuar ou deve retornar antecipadamente.
    if (repetitionCount > MAX_REPETITIONS) {
        throw new DiceSyntaxError(`O limite é ${MAX_REPETITIONS} repetições.`);
    }
// Regra de negócio: a validação abaixo decide se o fluxo pode continuar ou deve retornar antecipadamente.
    if (dicePerRepetition * repetitionCount > MAX_DICE_PER_ROLL) {
        throw new DiceSyntaxError(`O limite é ${MAX_DICE_PER_ROLL} dados totais por rolagem.`);
    }
// Regra de negócio: a validação abaixo decide se o fluxo pode continuar ou deve retornar antecipadamente.
    if (sides < 2) throw new DiceSyntaxError('Dados de uma face não são permitidos.');
// Regra de negócio: a validação abaixo decide se o fluxo pode continuar ou deve retornar antecipadamente.
    if (sides > MAX_DIE_SIDES) {
        throw new DiceSyntaxError(`O limite é ${MAX_DIE_SIDES} faces por dado.`);
    }

    let arithmetic: DiceRollModifiers['arithmetic'] = null;
// Estado intermediário: `operator` guarda o valor que será validado, transformado ou persistido nas etapas seguintes.
    const operator = match[6];
// Regra de negócio: a validação abaixo decide se o fluxo pode continuar ou deve retornar antecipadamente.
    if (operator !== undefined) {
// Estado intermediário: `value` guarda o valor que será validado, transformado ou persistido nas etapas seguintes.
        const value = safeInteger(match[7] as string, 'Modificador');
        arithmetic = {
            kind: operator === '++' || operator === '--' ? 'PER_DIE' : 'SUCCESS',
            operator: operator as DiceArithmeticModifier['operator'],
            value,
        };
    } else if (match[8] !== undefined) {
// Estado intermediário: `value` guarda o valor que será validado, transformado ou persistido nas etapas seguintes.
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

// API pública do módulo: `isDiceExpressionCandidate` define a interface pública consumida pelos demais módulos.
export function isDiceExpressionCandidate(content: string): boolean {
    return /^\d+#/.test(content)
        || /^\d+d/i.test(content)
        || /^d(?=$|[\d!ns+\-<> ])/i.test(content);
}

// Função auxiliar: `safeSum` isola uma responsabilidade reutilizada neste módulo.
function safeSum(values: readonly number[]): number {
// Estado intermediário: `total` guarda o valor que será validado, transformado ou persistido nas etapas seguintes.
    let total = 0;
// Iteração: percorre todos os elementos para aplicar a mesma regra a cada item.
    for (const value of values) {
        total += value;
// Regra de negócio: a validação abaixo decide se o fluxo pode continuar ou deve retornar antecipadamente.
        if (!Number.isSafeInteger(total)) {
            throw new DiceSyntaxError('O resultado excede o limite numérico seguro.');
        }
    }
    return total;
}

// Função auxiliar: `modifiedValue` isola uma responsabilidade reutilizada neste módulo.
function modifiedValue(value: number, parsed: ParsedDiceExpression): number {
// Estado intermediário: `modifier` guarda o valor que será validado, transformado ou persistido nas etapas seguintes.
    const modifier = parsed.modifiers.arithmetic;
// Regra de negócio: a validação abaixo decide se o fluxo pode continuar ou deve retornar antecipadamente.
    if (modifier?.kind !== 'PER_DIE') return value;
// Estado intermediário: `result` guarda o valor que será validado, transformado ou persistido nas etapas seguintes.
    const result = modifier.operator === '++'
        ? value + modifier.value
        : value - modifier.value;
// Regra de negócio: a validação abaixo decide se o fluxo pode continuar ou deve retornar antecipadamente.
    if (!Number.isSafeInteger(result)) {
        throw new DiceSyntaxError('O modificador excede o limite numérico seguro.');
    }
    return result;
}

// Função auxiliar: `rollOneDie` isola uma responsabilidade reutilizada neste módulo.
function rollOneDie(
    sides: number,
    exploding: boolean,
    randomInt: DiceRandomInt,
    parsed: ParsedDiceExpression,
): DiceRollDieResult {
    const rolls: number[] = [];
// Estado intermediário: `explosions` guarda o valor que será validado, transformado ou persistido nas etapas seguintes.
    let explosions = 0;
// Estado intermediário: `explosionLimitReached` guarda o valor que será validado, transformado ou persistido nas etapas seguintes.
    let explosionLimitReached = false;

// Repetição: continua tentando até que a operação produza um resultado válido ou atinja o limite defensivo.
    while (true) {
// Estado intermediário: `randomValue` guarda o valor que será validado, transformado ou persistido nas etapas seguintes.
        const randomValue = randomInt(sides);
// Regra de negócio: a validação abaixo decide se o fluxo pode continuar ou deve retornar antecipadamente.
        if (!Number.isInteger(randomValue) || randomValue < 0 || randomValue >= sides) {
            throw new Error('O gerador aleatório retornou um valor inválido.');
        }
// Estado intermediário: `value` guarda o valor que será validado, transformado ou persistido nas etapas seguintes.
        const value = randomValue + 1;
        rolls.push(value);
// Regra de negócio: a validação abaixo decide se o fluxo pode continuar ou deve retornar antecipadamente.
        if (!exploding || value !== sides) break;
// Regra de negócio: a validação abaixo decide se o fluxo pode continuar ou deve retornar antecipadamente.
        if (explosions === MAX_EXPLOSIONS_PER_DIE) {
            explosionLimitReached = true;
            break;
        }
        explosions += 1;
    }

// Estado intermediário: `modifiedRolls` guarda o valor que será validado, transformado ou persistido nas etapas seguintes.
    const modifiedRolls = rolls.map((value) => modifiedValue(value, parsed));
    return {
        rolls,
        modifiedRolls,
        rawTotal: safeSum(rolls),
        modifiedTotal: safeSum(modifiedRolls),
        explosionLimitReached,
    };
}

// Função auxiliar: `createRepetition` isola uma responsabilidade reutilizada neste módulo.
function createRepetition(
    repetition: number,
    parsed: ParsedDiceExpression,
    randomInt: DiceRandomInt,
): DiceRollRepetitionResult {
    const dice: DiceRollDieResult[] = [];
// Iteração: percorre todos os elementos para aplicar a mesma regra a cada item.
    for (let die = 0; die < parsed.dicePerRepetition; die += 1) {
        dice.push(rollOneDie(parsed.sides, parsed.modifiers.exploding, randomInt, parsed));
    }

// Estado intermediário: `rawRolls` guarda o valor que será validado, transformado ou persistido nas etapas seguintes.
    const rawRolls = dice.flatMap((die) => die.rolls);
// Estado intermediário: `modifiedRolls` guarda o valor que será validado, transformado ou persistido nas etapas seguintes.
    const modifiedRolls = dice.flatMap((die) => die.modifiedRolls);
// Estado intermediário: `displayRolls` guarda o valor que será validado, transformado ou persistido nas etapas seguintes.
    const displayRolls = parsed.modifiers.noSort
        ? [...rawRolls]
        : [...rawRolls].sort((left, right) => right - left);
// Estado intermediário: `displayModifiedRolls` guarda o valor que será validado, transformado ou persistido nas etapas seguintes.
    const displayModifiedRolls = parsed.modifiers.noSort
        ? [...modifiedRolls]
        : [...modifiedRolls].sort((left, right) => right - left);
// Estado intermediário: `modifier` guarda o valor que será validado, transformado ou persistido nas etapas seguintes.
    const modifier = parsed.modifiers.arithmetic;
    let total: number | null = null;
    let successes: number | null = null;

// Regra de negócio: a validação abaixo decide se o fluxo pode continuar ou deve retornar antecipadamente.
    if (modifier?.kind === 'SUCCESS') {
        successes = modifiedRolls.filter((value) => (
            modifier.operator === '>>' ? value >= modifier.value : value <= modifier.value
        )).length;
    } else {
// Estado intermediário: `diceTotal` guarda o valor que será validado, transformado ou persistido nas etapas seguintes.
        const diceTotal = safeSum(modifiedRolls);
        total = modifier?.kind === 'TOTAL'
            ? diceTotal + (modifier.operator === '+' ? modifier.value : -modifier.value)
            : diceTotal;
// Regra de negócio: a validação abaixo decide se o fluxo pode continuar ou deve retornar antecipadamente.
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

// API pública do módulo: `rollDiceExpression` define a interface pública consumida pelos demais módulos.
export function rollDiceExpression(
    expression: string,
    randomInt: DiceRandomInt = secureRandomInt,
): DiceRollResult {
// Estado intermediário: `parsed` guarda o valor que será validado, transformado ou persistido nas etapas seguintes.
    const parsed = parseDiceExpression(expression);
    const repetitions: DiceRollRepetitionResult[] = [];
// Iteração: percorre todos os elementos para aplicar a mesma regra a cada item.
    for (let index = 1; index <= parsed.repetitionCount; index += 1) {
        repetitions.push(createRepetition(index, parsed, randomInt));
    }
    return {
        ...parsed,
        repetitions,
    };
}
