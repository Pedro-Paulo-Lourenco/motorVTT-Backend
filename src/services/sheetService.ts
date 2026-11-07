import { randomUUID } from 'node:crypto';
import defaultTemplatePreset from '../presets/defaultTemplatePreset.json' with { type: 'json' };

import {
    ParticipantRole,
    SheetFieldType,
    detectCircularDependencies,
    evaluateFormula,
    extractFormulaReferences,
    validateFormula,
    sheetFieldsSchema,
    sheetTemplateSchema,
    type CharacterSheet,
    type JsonObject,
    type SheetField,
    type SheetFieldsSchema,
    type SheetTemplate,
} from '@motor-vtt/contracts';
import type { Pool, PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';

import pool from '../config/database.js';
import { HttpError } from '../http/errors.js';

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
    usuario_id: string;
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
        const dependencies = extractFormulaReferences(field.formula);
        for (const dependency of dependencies) {
            const dependencyField = formulasById.get(dependency);
            if (dependencyField) calculate(dependencyField);
        }
        let result: number;
        try {
            result = evaluateFormula(field.formula ?? '', calculated);
        } catch (error) {
            if (error instanceof Error && 'code' in error) {
                throw new HttpError(422, String(error.code), error.message);
            }
            throw error;
        }
        calculated[field.id] = result;
        values[field.id] = result;
        visiting.delete(field.id);
        return result;
    };

    for (const field of formulaFields) calculate(field);
    return values;
}

function validateTemplateFields(fields: SheetField[]): void {
    const ids = new Set(fields.map((field) => field.id));
    for (const field of fields) {
        if (!field.formula) continue;
        const result = validateFormula(field.formula, ids);
        if (!result.valid) {
            const formulaError = result.error;
            throw new HttpError(
                422,
                formulaError?.code ?? 'INVALID_FORMULA',
                `Fórmula inválida no campo "${field.label}": ${formulaError?.message ?? 'revise a expressão.'}`,
            );
        }
    }
    const cycle = fields.length > 0 && detectCircularDependencies(fields);
    if (cycle) {
        throw new HttpError(422, 'CIRCULAR_FORMULA_DEPENDENCY', 'O template contém referências circulares.');
    }
}

export interface UpdateTemplateData {
    nome?: string | undefined;
    sistema?: string | null | undefined;
    camposSchema?: InputSheetFieldsSchema | undefined;
}

export interface CreateTemplateData {
    usuarioId: string;
    nome?: string;
    sistema?: string | null;
    salaId?: string | null;
    camposSchema?: InputSheetFieldsSchema;
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
        const camposSchema = normalizeFieldsSchema(data.camposSchema ?? sheetFieldsSchema.parse(defaultTemplatePreset));
        const templateFields = [
            ...camposSchema.cabecalho,
            ...camposSchema.atributos,
            ...camposSchema.recursos,
            ...camposSchema.pericias,
        ];
        validateTemplateFields(templateFields);
        const id = randomUUID();
        await this.database.query(
            `INSERT INTO sheet_templates
                (id, usuario_id, sala_id, nome, sistema, campos_schema)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [id, data.usuarioId, data.salaId ?? null, data.nome ?? 'Template Padrão', data.sistema ?? null, JSON.stringify(camposSchema)],
        );
        return this.getTemplateById(id);
    }

    public async listTemplates(userId: string): Promise<SheetTemplate[]> {
        const [rows] = await this.database.query<TemplateRow[]>(`SELECT id, usuario_id, sala_id, nome, sistema, campos_schema, created_at, updated_at FROM sheet_templates WHERE usuario_id = ? ORDER BY created_at DESC`, [userId]);
        return rows.map(toTemplate);
    }

    public async getUserLibrary(userId: string): Promise<{ templates: SheetTemplate[]; sheets: CharacterSheet[] }> {
        const [templateRows] = await this.database.query<TemplateRow[]>(
            `SELECT id, usuario_id, sala_id, nome, sistema, campos_schema, created_at, updated_at
             FROM sheet_templates WHERE usuario_id = ? ORDER BY created_at DESC`,
            [userId],
        );
        const [sheetRows] = await this.database.query<SheetRow[]>(
            `SELECT id, template_id, usuario_id, sala_id, nome, dados_preenchidos, versao, created_at, updated_at
             FROM character_sheets WHERE usuario_id = ? ORDER BY created_at DESC`,
            [userId],
        );
        return { templates: templateRows.map(toTemplate), sheets: sheetRows.map(toSheet) };
    }

    public async cloneTemplate(templateId: string, userId: string): Promise<SheetTemplate> {
        const source = await this.getTemplateById(templateId);
        return this.createTemplate({
            usuarioId: userId,
            nome: `${source.nome} (Cópia)`.slice(0, 160),
            ...(source.sistema === null || source.sistema === undefined ? {} : { sistema: source.sistema }),
            camposSchema: source.camposSchema,
        });
    }

    public async listRoomTemplates(roomId: string, userId: string): Promise<SheetTemplate[]> {
        const [rows] = await this.database.query<TemplateRow[]>(
            `SELECT t.id, t.usuario_id, t.sala_id, t.nome, t.sistema, t.campos_schema, t.created_at, t.updated_at
             FROM room_sheet_templates rst
             INNER JOIN sheet_templates t ON t.id = rst.template_id
             INNER JOIN participants p ON p.sala_id = rst.sala_id
             WHERE rst.sala_id = ? AND p.usuario_id = ? AND p.ativo = TRUE
             ORDER BY t.created_at DESC`,
            [roomId, userId],
        );
        return rows.map(toTemplate);
    }

    public async addRoomTemplate(roomId: string, templateId: string, userId: string): Promise<void> {
        const [templateRows] = await this.database.query<RowDataPacket[]>(
            `SELECT t.id FROM sheet_templates t WHERE t.id = ? AND t.usuario_id = ?`,
            [templateId, userId],
        );
        if (!templateRows[0]) throw new HttpError(404, 'SHEET_TEMPLATE_NOT_FOUND', 'Template de ficha não encontrado.');
        const [roomRows] = await this.database.query<RowDataPacket[]>(
            `SELECT p.sala_id FROM participants p WHERE p.sala_id = ? AND p.usuario_id = ? AND p.papel = 'MESTRE' AND p.ativo = TRUE`,
            [roomId, userId],
        );
        if (!roomRows[0]) throw new HttpError(403, 'ROOM_MASTER_REQUIRED', 'Apenas o Mestre pode configurar a sala.');
        await this.database.query(
            `INSERT IGNORE INTO room_sheet_templates (sala_id, template_id) VALUES (?, ?)`,
            [roomId, templateId],
        );
    }

    public async removeRoomTemplate(roomId: string, templateId: string, userId: string): Promise<void> {
        const [roomRows] = await this.database.query<RowDataPacket[]>(
            `SELECT p.sala_id FROM participants p WHERE p.sala_id = ? AND p.usuario_id = ? AND p.papel = 'MESTRE' AND p.ativo = TRUE`,
            [roomId, userId],
        );
        if (!roomRows[0]) throw new HttpError(403, 'ROOM_MASTER_REQUIRED', 'Apenas o Mestre pode configurar a sala.');
        await this.database.query(
            `DELETE FROM room_sheet_templates WHERE sala_id = ? AND template_id = ?`,
            [roomId, templateId],
        );
    }

    public async updateTemplate(id: string, userId: string, data: UpdateTemplateData): Promise<SheetTemplate> {
        if (data.camposSchema) {
            validateTemplateFields([
                ...data.camposSchema.cabecalho,
                ...data.camposSchema.atributos,
                ...data.camposSchema.recursos,
                ...data.camposSchema.pericias,
            ].map((field) => ({
                id: field.id,
                label: field.label,
                type: field.type,
                ...(field.formula === undefined ? {} : { formula: field.formula }),
                ...(field.required === undefined ? {} : { required: field.required }),
                ...(field.attributeId === undefined ? {} : { attributeId: field.attributeId }),
            })));
        }
        const [result] = await this.database.query(`UPDATE sheet_templates SET nome = COALESCE(?, nome), sistema = ?, campos_schema = COALESCE(?, campos_schema) WHERE id = ? AND usuario_id = ?`, [data.nome ?? null, data.sistema ?? null, data.camposSchema ? JSON.stringify(normalizeFieldsSchema(data.camposSchema)) : null, id, userId]);
        if ((result as { affectedRows: number }).affectedRows === 0) throw new HttpError(404, 'SHEET_TEMPLATE_NOT_FOUND', 'Template de ficha não encontrado.');
        return this.getTemplateById(id);
    }

    public async deleteTemplate(id: string, userId: string): Promise<void> {
        try {
            const [result] = await this.database.query(`DELETE FROM sheet_templates WHERE id = ? AND usuario_id = ?`, [id, userId]);
            if ((result as { affectedRows: number }).affectedRows === 0) throw new HttpError(404, 'SHEET_TEMPLATE_NOT_FOUND', 'Template de ficha não encontrado.');
        } catch (error) {
            if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'ER_ROW_IS_REFERENCED_2') throw new HttpError(409, 'SHEET_TEMPLATE_IN_USE', 'Template de ficha está em uso.');
            throw error;
        }
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

    public async cloneSheet(sheetId: string, userId: string): Promise<CharacterSheet> {
        const source = await this.getCharacterSheetById(sheetId, userId);
        return this.createSheet({
            usuarioId: userId,
            templateId: source.templateId,
            nome: `${source.nome} (Cópia)`.slice(0, 160),
            dadosPreenchidos: objectValue(source.dadosPreenchidos),
        });
    }

    public async importSheetToRoom(sheetId: string, roomId: string, userId: string): Promise<CharacterSheet> {
        const [membership] = await this.database.query<RowDataPacket[]>(
            `SELECT id FROM participants WHERE sala_id = ? AND usuario_id = ? AND ativo = TRUE`,
            [roomId, userId],
        );
        if (!membership[0]) throw new HttpError(403, 'ROOM_ACCESS_DENIED', 'Você não participa desta sala.');
        const [result] = await this.database.query<ResultSetHeader>(
            `UPDATE character_sheets SET sala_id = ? WHERE id = ? AND usuario_id = ?`,
            [roomId, sheetId, userId],
        );
        if (result.affectedRows === 0) throw new HttpError(404, 'CHARACTER_SHEET_NOT_FOUND', 'Ficha de personagem não encontrada.');
        return this.getSheetById(sheetId, userId);
    }

    public async linkSheetToToken(roomId: string, tokenId: string, sheetId: string, userId: string): Promise<void> {
        const [masterRows] = await this.database.query<RowDataPacket[]>(
            `SELECT p.sala_id FROM participants p WHERE p.sala_id = ? AND p.usuario_id = ? AND p.papel = 'MESTRE' AND p.ativo = TRUE`,
            [roomId, userId],
        );
        const [ownerRows] = await this.database.query<RowDataPacket[]>(
            `SELECT id FROM character_sheets WHERE id = ? AND usuario_id = ? AND sala_id = ?`,
            [sheetId, userId, roomId],
        );
        if (!masterRows[0] && !ownerRows[0]) throw new HttpError(403, 'ROOM_MASTER_REQUIRED', 'Apenas o Mestre ou dono da ficha pode vinculá-la.');
        const [sheetRows] = await this.database.query<RowDataPacket[]>(
            `SELECT id FROM character_sheets WHERE id = ? AND sala_id = ?`, [sheetId, roomId],
        );
        if (!sheetRows[0]) throw new HttpError(404, 'CHARACTER_SHEET_NOT_FOUND', 'Ficha não encontrada nesta sala.');
        const [result] = await this.database.query<ResultSetHeader>(
            `UPDATE tokens t INNER JOIN scenes s ON s.id = t.cena_id INNER JOIN boards b ON b.cena_ativa_id = s.id
             SET t.character_sheet_id = ? WHERE t.id = ? AND b.sala_id = ?`,
            [sheetId, tokenId, roomId],
        );
        if (result.affectedRows === 0) throw new HttpError(404, 'TOKEN_NOT_FOUND', 'Token não encontrado nesta sala.');
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
