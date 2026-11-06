import type { SheetField } from '@motor-vtt/contracts';

export type TemplateFieldSchema = SheetField;
export type FormulaValue = number | null | undefined;

const variablePattern = /@([A-Za-z_][A-Za-z0-9_]*)/g;

function referencedFieldIds(formula: string | null | undefined): string[] {
    if (!formula) return [];
    return [...formula.matchAll(variablePattern)].map((match) => match[1]).filter(
        (id): id is string => id !== undefined,
    );
}

export function detectCircularDependencies(fields: TemplateFieldSchema[]): boolean {
    const graph = new Map<string, string[]>();
    for (const field of fields) {
        graph.set(field.id, referencedFieldIds(field.formula));
    }

    const visiting = new Set<string>();
    const visited = new Set<string>();

    const visit = (fieldId: string): boolean => {
        if (visiting.has(fieldId)) return true;
        if (visited.has(fieldId)) return false;

        visiting.add(fieldId);
        for (const dependency of graph.get(fieldId) ?? []) {
            if (graph.has(dependency) && visit(dependency)) return true;
        }
        visiting.delete(fieldId);
        visited.add(fieldId);
        return false;
    };

    for (const field of fields) {
        if (visit(field.id)) return true;
    }
    return false;
}

type Token =
    | { kind: 'number'; value: number }
    | { kind: 'variable'; value: string }
    | { kind: 'identifier'; value: string }
    | { kind: 'operator'; value: '+' | '-' | '*' | '/' }
    | { kind: 'leftParen' }
    | { kind: 'rightParen' }
    | { kind: 'comma' }
    | { kind: 'eof' };

function tokenize(formula: string): Token[] {
    const tokens: Token[] = [];
    let index = 0;

    while (index < formula.length) {
        const character = formula[index];
        if (character === undefined) break;
        if (/\s/.test(character)) {
            index += 1;
            continue;
        }

        if (/[0-9.]/.test(character)) {
            const start = index;
            let dots = 0;
            while (index < formula.length && /[0-9.]/.test(formula[index] ?? '')) {
                if (formula[index] === '.') dots += 1;
                index += 1;
            }
            const value = Number(formula.slice(start, index));
            if (dots > 1 || !Number.isFinite(value)) {
                throw new Error(`Número inválido na posição ${start}.`);
            }
            tokens.push({ kind: 'number', value });
            continue;
        }

        if (character === '@') {
            const match = formula.slice(index).match(/^@([A-Za-z_][A-Za-z0-9_]*)/);
            if (!match) throw new Error(`Referência inválida na posição ${index}.`);
            tokens.push({ kind: 'variable', value: match[1] ?? '' });
            index += match[0].length;
            continue;
        }

        if (/[A-Za-z_]/.test(character)) {
            const match = formula.slice(index).match(/^[A-Za-z_][A-Za-z0-9_]*/);
            if (!match) throw new Error(`Identificador inválido na posição ${index}.`);
            tokens.push({ kind: 'identifier', value: match[0] });
            index += match[0].length;
            continue;
        }

        if (character === '+' || character === '-' || character === '*' || character === '/') {
            tokens.push({ kind: 'operator', value: character });
        } else if (character === '(') {
            tokens.push({ kind: 'leftParen' });
        } else if (character === ')') {
            tokens.push({ kind: 'rightParen' });
        } else if (character === ',') {
            tokens.push({ kind: 'comma' });
        } else {
            throw new Error(`Caractere não suportado na posição ${index}: "${character}".`);
        }
        index += 1;
    }

    tokens.push({ kind: 'eof' });
    return tokens;
}

function numericValue(value: unknown): number {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    return 0;
}

class FormulaParser {
    private position = 0;

    public constructor(
        private readonly tokens: Token[],
        private readonly valuesMap: Record<string, unknown>,
    ) {}

    public parse(): number {
        const value = this.parseExpression();
        if (this.peek().kind !== 'eof') throw new Error('Fórmula inválida: tokens após a expressão.');
        return value;
    }

    private parseExpression(): number {
        let value = this.parseTerm();
        while (this.matchOperator('+') || this.matchOperator('-')) {
            const operator = this.previous();
            const right = this.parseTerm();
            value = operator.value === '+' ? value + right : value - right;
        }
        return value;
    }

    private parseTerm(): number {
        let value = this.parseUnary();
        while (this.matchOperator('*') || this.matchOperator('/')) {
            const operator = this.previous();
            const right = this.parseUnary();
            if (operator.value === '/') {
                if (right === 0) throw new Error('Divisão por zero na fórmula.');
                value /= right;
            } else {
                value *= right;
            }
        }
        return value;
    }

    private parseUnary(): number {
        if (this.matchOperator('+')) return this.parseUnary();
        if (this.matchOperator('-')) return -this.parseUnary();
        return this.parsePrimary();
    }

    private parsePrimary(): number {
        const token = this.peek();
        if (this.match('number')) return token.kind === 'number' ? token.value : 0;
        if (this.match('variable')) {
            return token.kind === 'variable' ? numericValue(this.valuesMap[token.value]) : 0;
        }
        if (this.match('leftParen')) {
            const value = this.parseExpression();
            this.expect('rightParen');
            return value;
        }
        if (token.kind === 'identifier') return this.parseFunction();
        throw new Error('Fórmula inválida: expressão esperada.');
    }

    private parseFunction(): number {
        const name = this.advance();
        if (name.kind !== 'identifier') throw new Error('Função inválida.');
        this.expect('leftParen');
        const argumentsList: number[] = [];
        if (!this.check('rightParen')) {
            do {
                argumentsList.push(this.parseExpression());
            } while (this.match('comma'));
        }
        this.expect('rightParen');

        if (name.value === 'floor' && argumentsList.length === 1) return Math.floor(argumentsList[0] ?? 0);
        if (name.value === 'ceil' && argumentsList.length === 1) return Math.ceil(argumentsList[0] ?? 0);
        if (name.value === 'min' && argumentsList.length > 0) return Math.min(...argumentsList);
        if (name.value === 'max' && argumentsList.length > 0) return Math.max(...argumentsList);
        throw new Error(`Função ou quantidade de argumentos inválida: ${name.value}.`);
    }

    private matchOperator(operator: '+' | '-' | '*' | '/'): boolean {
        const token = this.peek();
        return token.kind === 'operator' && token.value === operator && Boolean(this.advance());
    }

    private match(kind: Token['kind']): boolean {
        if (!this.check(kind)) return false;
        this.advance();
        return true;
    }

    private check(kind: Token['kind']): boolean {
        return this.peek().kind === kind;
    }

    private expect(kind: Exclude<Token['kind'], 'number' | 'variable' | 'identifier' | 'operator' | 'eof'>): void {
        if (!this.match(kind)) throw new Error(`Fórmula inválida: esperado ${kind}.`);
    }

    private advance(): Token {
        const token = this.tokens[this.position] ?? { kind: 'eof' as const };
        this.position += 1;
        return token;
    }

    private peek(): Token {
        return this.tokens[this.position] ?? { kind: 'eof' as const };
    }

    private previous(): Extract<Token, { kind: 'operator' }> {
        const token = this.tokens[this.position - 1];
        if (!token || token.kind !== 'operator') throw new Error('Operador inválido.');
        return token;
    }
}

export function evaluateFormula(formula: string, valuesMap: Record<string, unknown>): number {
    if (!formula.trim()) return 0;
    return new FormulaParser(tokenize(formula), valuesMap).parse();
}
