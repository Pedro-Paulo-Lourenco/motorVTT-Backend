import { randomUUID } from 'node:crypto';

import {
    ParticipantRole,
    SheetFieldType,
    sheetTemplateSchema,
    type CharacterSheet,
    type JsonObject,
    type SheetField,
    type SheetFieldsSchema,
    type SheetTemplate,
} from '@motor-vtt/contracts';
import type { Pool, PoolConnection, RowDataPacket } from 'mysql2/promise';

import pool from '../config/database.js';
import { HttpError } from '../http/errors.js';
import {
    detectCircularDependencies,
    evaluateFormula,
} from './formulaParser.js';

type JsonRecord = Record<string, unknown>;
type InputSheetField = Omit<SheetField, 'formula' | 'required' | 'attributeId'> & {
    formula?: string | null | undefined;
    required?: boolean | undefined;
    attributeId?: string | null | undefined;
};
type InputSheetFieldsSchema = {
    cabecalho: InputSheetField[];
    atributos: InputSheetField[];
    recursos: InputSheetField[];
    pericias: InputSheetField[];
};

type TemplateRow = RowDataPacket & {
    id: string;
    usuario_id: string | null;
    sala_id: string | null;
    nome: string;
    sistema: string | null;
    campos_schema: unknown;
    created_at: Date;
    updated_at: Date;
};

type SheetRow = RowDataPacket & {
    id: string;
    template_id: string;
    usuario_id: string;
    sala_id: string | null;
    nome: string;
    dados_preenchidos: unknown;
    versao: number;
    created_at: Date;
    updated_at: Date;
};

type TokenBarRow = RowDataPacket & {
    id: string;
    status_bar_map: unknown;
};

function parseJson(value: unknown): unknown {
    return typeof value === 'string' ? JSON.parse(value) as unknown : value;
}

function objectValue(value: unknown): JsonRecord {
    const parsed = parseJson(value);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        throw new HttpError(500, 'INVALID_SHEET_JSON', 'JSON de ficha inválido armazenado no banco.');
    }
    return parsed as JsonRecord;
}

function toTemplate(row: TemplateRow): SheetTemplate {
    const parsed = sheetTemplateSchema.parse({
        id: row.id,
        usuarioId: row.usuario_id,
        salaId: row.sala_id,
        nome: row.nome,
        sistema: row.sistema,
        camposSchema: parseJson(row.campos_schema),
        createdAt: row.created_at.toISOString(),
        updatedAt: row.updated_at.toISOString(),
    });
    return {
        id: parsed.id,
        usuarioId: row.usuario_id,
        salaId: row.sala_id,
        nome: parsed.nome,
        sistema: row.sistema,
        camposSchema: normalizeFieldsSchema(parsed.camposSchema),
        createdAt: parsed.createdAt,
        updatedAt: parsed.updatedAt,
    };
}

function toSheet(row: SheetRow): CharacterSheet {
    return {
        id: row.id,
        templateId: row.template_id,
        usuarioId: row.usuario_id,
        salaId: row.sala_id,
        nome: row.nome,
        dadosPreenchidos: objectValue(row.dados_preenchidos) as JsonObject,
        versao: row.versao,
        createdAt: row.created_at.toISOString(),
        updatedAt: row.updated_at.toISOString(),
    };
}

function allFields(template: SheetTemplate): SheetField[] {
    return [
        ...template.camposSchema.cabecalho,
        ...template.camposSchema.atributos,
        ...template.camposSchema.recursos,
        ...template.camposSchema.pericias,
    ];
}

function normalizeFieldsSchema(schema: InputSheetFieldsSchema): SheetFieldsSchema {
    const normalize = (fields: InputSheetField[]): SheetField[] => fields.map((field) => {
        const normalized: SheetField = { id: field.id, label: field.label, type: field.type };
        if (field.formula !== undefined) normalized.formula = field.formula;
        if (field.required !== undefined) normalized.required = field.required;
        if (field.attributeId !== undefined) normalized.attributeId = field.attributeId;
        return normalized;
    });
    return {
        cabecalho: normalize(schema.cabecalho),
        atributos: normalize(schema.atributos),
        recursos: normalize(schema.recursos),
        pericias: normalize(schema.pericias),
    };
}

function numericValues(values: JsonRecord): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const [id, value] of Object.entries(values)) {
        if (typeof value === 'object' && value !== null && !Array.isArray(value)
            && 'atual' in value && typeof value.atual === 'number') {
            result[id] = value.atual;
        } else {
            result[id] = value;
        }
    }
    return result;
}

function recalculateValues(template: SheetTemplate, values: JsonRecord): JsonRecord {
    const fields = allFields(template);
    if (detectCircularDependencies(fields)) {
        throw new HttpError(422, 'CIRCULAR_FORMULA_DEPENDENCY', 'O template contém referências circulares.');
    }

    const formulaFields = fields.filter((field) => field.formula !== undefined && field.formula !== null);
    const formulasById = new Map(formulaFields.map((field) => [field.id, field]));
    const visiting = new Set<string>();
    const calculated = numericValues(values);

    const calculate = (field: SheetField): number => {
        const existing = calculated[field.id];
        if (typeof existing === 'number' && field.type !== SheetFieldType.FORMULA) return existing;
        if (visiting.has(field.id)) {
            throw new HttpError(422, 'CIRCULAR_FORMULA_DEPENDENCY', 'O template contém referências circulares.');
        }
        visiting.add(field.id);
        const dependencies = [...(field.formula?.matchAll(/@([A-Za-z_][A-Za-z0-9_]*)/g) ?? [])]
            .map((match) => match[1])
            .filter((id): id is string => id !== undefined);
        for (const dependency of dependencies) {
            const dependencyField = formulasById.get(dependency);
            if (dependencyField) calculate(dependencyField);
        }
        const result = evaluateFormula(field.formula ?? '', calculated);
        calculated[field.id] = result;
        values[field.id] = result;
        visiting.delete(field.id);
        return result;
    };

    for (const field of formulaFields) calculate(field);
    return values;
}

export interface CreateTemplateData {
    usuarioId: string;
    nome: string;
    sistema?: string | null;
    salaId?: string | null;
    camposSchema: InputSheetFieldsSchema;
}

export interface CreateSheetData {
    usuarioId: string;
    templateId: string;
    nome: string;
    salaId?: string | null;
    dadosPreenchidos?: JsonRecord;
}

export interface TokenBarUpdate {
    tokenId: string;
    currentValue: number;
    maxValue: number;
}

export class SheetService {
    public constructor(private readonly database: Pool = pool) {}

    public async createTemplate(data: CreateTemplateData): Promise<SheetTemplate> {
        const camposSchema = normalizeFieldsSchema(data.camposSchema);
        const templateFields = [
            ...camposSchema.cabecalho,
            ...camposSchema.atributos,
            ...camposSchema.recursos,
            ...camposSchema.pericias,
        ];
        if (detectCircularDependencies(templateFields)) {
            throw new HttpError(422, 'CIRCULAR_FORMULA_DEPENDENCY', 'O template contém referências circulares.');
        }
        const id = randomUUID();
        await this.database.query(
            `INSERT INTO sheet_templates
                (id, usuario_id, sala_id, nome, sistema, campos_schema)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [id, data.usuarioId, data.salaId ?? null, data.nome, data.sistema ?? null, JSON.stringify(camposSchema)],
        );
        return this.getTemplateById(id);
    }

    public async getTemplateById(id: string): Promise<SheetTemplate> {
        const [rows] = await this.database.query<TemplateRow[]>(
            `SELECT id, usuario_id, sala_id, nome, sistema, campos_schema, created_at, updated_at
             FROM sheet_templates WHERE id = ?`,
            [id],
        );
        const row = rows[0];
        if (!row) throw new HttpError(404, 'SHEET_TEMPLATE_NOT_FOUND', 'Template de ficha não encontrado.');
        return toTemplate(row);
    }

    public async createSheet(data: CreateSheetData): Promise<CharacterSheet> {
        const template = await this.getTemplateById(data.templateId);
        const values = recalculateValues(template, { ...(data.dadosPreenchidos ?? {}) });
        const id = randomUUID();
        await this.database.query(
            `INSERT INTO character_sheets
                (id, template_id, usuario_id, sala_id, nome, dados_preenchidos)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [id, data.templateId, data.usuarioId, data.salaId ?? null, data.nome, JSON.stringify(values)],
        );
        return this.getSheetById(id, data.usuarioId);
    }

    public async getCharacterSheetById(sheetId: string, userId: string): Promise<CharacterSheet> {
        const [rows] = await this.database.query<SheetRow[]>(
            `SELECT id, template_id, usuario_id, sala_id, nome, dados_preenchidos, versao, created_at, updated_at
             FROM character_sheets s
             WHERE s.id = ?
               AND (
                 s.usuario_id = ?
                 OR EXISTS (
                   SELECT 1 FROM participants p
                   INNER JOIN rooms r ON r.id = p.sala_id
                   WHERE p.sala_id = s.sala_id
                     AND p.usuario_id = ?
                     AND p.ativo = TRUE
                     AND p.papel = 'MESTRE'
                     AND r.status = 'ATIVA'
                 )
               )`,
            [sheetId, userId, userId],
        );
        const row = rows[0];
        if (!row) throw new HttpError(404, 'CHARACTER_SHEET_NOT_FOUND', 'Ficha de personagem não encontrada.');
        return toSheet(row);
    }

    public async updateSheetValues(
        sheetId: string,
        userId: string,
        newValues: JsonRecord,
    ): Promise<CharacterSheet> {
        const connection = await this.database.getConnection();
        try {
            await connection.beginTransaction();
            const sheet = await this.getSheetRow(connection, sheetId, userId, true);
            const template = await this.getTemplateById(sheet.template_id);
            const values = recalculateValues(template, {
                ...objectValue(sheet.dados_preenchidos),
                ...newValues,
            });
            await connection.query(
                `UPDATE character_sheets
                 SET dados_preenchidos = ?, versao = versao + 1
                 WHERE id = ? AND usuario_id = ?`,
                [JSON.stringify(values), sheetId, userId],
            );
            await connection.commit();
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
        return this.getSheetById(sheetId, userId);
    }

    public async updateSheetResource(
        sheetId: string,
        roomId: string,
        actorId: string,
        fieldId: string,
        newValue: number | JsonRecord,
    ): Promise<{ sheet: CharacterSheet; tokenBar?: TokenBarUpdate }> {
        const connection = await this.database.getConnection();
        try {
            await connection.beginTransaction();
            const sheet = await this.getSheetForRoom(connection, sheetId, roomId, true);
            if (sheet.usuario_id !== actorId) {
                const [memberships] = await connection.query<Array<RowDataPacket & { papel: ParticipantRole }>>(
                    `SELECT p.papel
                     FROM participants p
                     INNER JOIN rooms r ON r.id = p.sala_id
                     WHERE p.sala_id = ? AND p.usuario_id = ? AND p.ativo = TRUE
                       AND r.status = 'ATIVA' LIMIT 1`,
                    [roomId, actorId],
                );
                if (memberships[0]?.papel !== ParticipantRole.MESTRE) {
                    throw new HttpError(403, 'SHEET_UPDATE_FORBIDDEN', 'Somente o dono ou o mestre pode alterar a ficha.');
                }
            }

            const existing = objectValue(sheet.dados_preenchidos);
            const previous = existing[fieldId];
            const value = typeof newValue === 'number'
                ? (typeof previous === 'object' && previous !== null && !Array.isArray(previous)
                    && 'maximo' in previous
                    ? { atual: newValue, maximo: previous.maximo }
                    : newValue)
                : newValue;
            const updatedValues = { ...existing, [fieldId]: value };
            const template = await this.getTemplateById(sheet.template_id);
            const recalculated = recalculateValues(template, updatedValues);
            await connection.query(
                `UPDATE character_sheets
                 SET dados_preenchidos = ?, versao = versao + 1
                 WHERE id = ? AND sala_id = ?`,
                [JSON.stringify(recalculated), sheetId, roomId],
            );
            await connection.commit();
            const updatedSheet = await this.getSheetForUser(sheetId, actorId, sheet.usuario_id);
            return {
                sheet: updatedSheet,
                ...(await this.findTokenBar(roomId, sheetId, fieldId, recalculated)),
            };
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    }

    private async getSheetById(id: string, userId: string): Promise<CharacterSheet> {
        const [rows] = await this.database.query<SheetRow[]>(
            `SELECT id, template_id, usuario_id, sala_id, nome, dados_preenchidos, versao, created_at, updated_at
             FROM character_sheets WHERE id = ? AND usuario_id = ?`,
            [id, userId],
        );
        const row = rows[0];
        if (!row) throw new HttpError(404, 'CHARACTER_SHEET_NOT_FOUND', 'Ficha de personagem não encontrada.');
        return toSheet(row);
    }

    private async getSheetForUser(id: string, actorId: string, ownerId: string): Promise<CharacterSheet> {
        return this.getSheetById(id, actorId === ownerId ? ownerId : ownerId);
    }

    private async getSheetForRoom(
        connection: PoolConnection,
        id: string,
        roomId: string,
        forUpdate: boolean,
    ): Promise<SheetRow> {
        const [rows] = await connection.query<SheetRow[]>(
            `SELECT id, template_id, usuario_id, sala_id, nome, dados_preenchidos, versao, created_at, updated_at
             FROM character_sheets WHERE id = ? AND sala_id = ?${forUpdate ? ' FOR UPDATE' : ''}`,
            [id, roomId],
        );
        const row = rows[0];
        if (!row) throw new HttpError(404, 'CHARACTER_SHEET_NOT_FOUND', 'Ficha de personagem não encontrada.');
        return row;
    }

    private async findTokenBar(
        roomId: string,
        sheetId: string,
        fieldId: string,
        values: JsonRecord,
    ): Promise<{ tokenBar?: TokenBarUpdate }> {
        const [rows] = await this.database.query<TokenBarRow[]>(
            `SELECT t.id, t.status_bar_map
             FROM tokens t
             INNER JOIN scenes s ON s.id = t.cena_id
             INNER JOIN boards b ON b.id = s.tabuleiro_id
             WHERE b.sala_id = ? AND t.character_sheet_id = ?`,
            [roomId, sheetId],
        );
        for (const row of rows) {
            const map = parseJson(row.status_bar_map);
            if (typeof map !== 'object' || map === null || Array.isArray(map)) continue;
            for (const mappingValue of Object.values(map as Record<string, unknown>)) {
                if (typeof mappingValue !== 'object' || mappingValue === null || Array.isArray(mappingValue)) continue;
                const mapping = mappingValue as Record<string, unknown>;
                const currentField = mapping.current;
                const maximumField = mapping.maximum;
                if (typeof currentField !== 'string' || typeof maximumField !== 'string') continue;
                if (currentField !== fieldId && maximumField !== fieldId) continue;
                const currentValue = values[currentField];
                const maxValue = values[maximumField];
                const currentNumber = typeof currentValue === 'number'
                    ? currentValue
                    : typeof currentValue === 'object' && currentValue !== null
                        && !Array.isArray(currentValue)
                        && typeof (currentValue as Record<string, unknown>).atual === 'number'
                        ? (currentValue as Record<string, unknown>).atual as number
                        : undefined;
                const maxNumber = typeof maxValue === 'number'
                    ? maxValue
                    : typeof maxValue === 'object' && maxValue !== null
                        && !Array.isArray(maxValue)
                        && typeof (maxValue as Record<string, unknown>).maximo === 'number'
                        ? (maxValue as Record<string, unknown>).maximo as number
                        : undefined;
                if (currentNumber !== undefined && maxNumber !== undefined) {
                    return { tokenBar: { tokenId: row.id, currentValue: currentNumber, maxValue: maxNumber } };
                }
            }
        }
        return {};
    }

    private async getSheetRow(
        connection: PoolConnection,
        id: string,
        userId: string,
        forUpdate: boolean,
    ): Promise<SheetRow> {
        const [rows] = await connection.query<SheetRow[]>(
            `SELECT id, template_id, usuario_id, sala_id, nome, dados_preenchidos, versao, created_at, updated_at
             FROM character_sheets WHERE id = ? AND usuario_id = ?${forUpdate ? ' FOR UPDATE' : ''}`,
            [id, userId],
        );
        const row = rows[0];
        if (!row) throw new HttpError(404, 'CHARACTER_SHEET_NOT_FOUND', 'Ficha de personagem não encontrada.');
        return row;
    }
}

export const sheetService = new SheetService();
