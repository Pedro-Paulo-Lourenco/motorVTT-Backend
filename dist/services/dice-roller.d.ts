export declare const MAX_DICE_PER_ROLL = 100;
export declare const MAX_REPETITIONS = 100;
export declare const MAX_DIE_SIDES = 1000000;
export declare const MAX_EXPLOSIONS_PER_DIE = 100;
export declare class DiceSyntaxError extends Error {
    constructor(message: string);
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
export declare function parseDiceExpression(expression: string): ParsedDiceExpression;
export declare function isDiceExpressionCandidate(content: string): boolean;
export declare function rollDiceExpression(expression: string, randomInt?: DiceRandomInt): DiceRollResult;
export {};
//# sourceMappingURL=dice-roller.d.ts.map