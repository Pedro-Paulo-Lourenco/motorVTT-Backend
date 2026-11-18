/** Encapsula o ciclo de vida de templates e fichas de personagem. */
// Importações: reúnem bibliotecas, tipos e módulos locais usados pelos blocos seguintes.
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
// Tipo: `CharacterSheet` descreve o formato estruturado usado nas operações relacionadas.
    type CharacterSheet,
// Tipo: `JsonObject` descreve o formato estruturado usado nas operações relacionadas.
    type JsonObject,
// Tipo: `SheetField` descreve o formato estruturado usado nas operações relacionadas.
    type SheetField,
// Tipo: `SheetFieldsSchema` descreve o formato estruturado usado nas operações relacionadas.
    type SheetFieldsSchema,
// Tipo: `SheetTemplate` descreve o formato estruturado usado nas operações relacionadas.
    type SheetTemplate,
} from '@motor-vtt/contracts';
import type { Pool, PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';

import pool from '../config/database.js';
import { HttpError } from '../http/errors.js';

// Tipo: `JsonRecord` descreve o formato estruturado usado nas operações relacionadas.
type JsonRecord = Record<string, unknown>;
// Tipo: `InputSheetField` descreve o formato estruturado usado nas operações relacionadas.
type InputSheetField = Omit<SheetField, 'formula' | 'required' | 'attributeId'> & {
    formula?: string | null | undefined;
    required?: boolean | undefined;
    attributeId?: string | null | undefined;
};
// Tipo: `InputSheetFieldsSchema` descreve o formato estruturado usado nas operações relacionadas.
type InputSheetFieldsSchema = {
    cabecalho: InputSheetField[];
    atributos: InputSheetField[];
    recursos: InputSheetField[];
    pericias: InputSheetField[];
};

// Tipo: `TemplateRow` descreve o formato estruturado usado nas operações relacionadas.
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

// Tipo: `SheetRow` descreve o formato estruturado usado nas operações relacionadas.
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

// Tipo: `TokenBarRow` descreve o formato estruturado usado nas operações relacionadas.
type TokenBarRow = RowDataPacket & {
    id: string;
    status_bar_map: unknown;
};

// Bloco local: `parseJson` concentra uma responsabilidade reutilizada dentro deste módulo.
function parseJson(value: unknown): unknown {
    return typeof value === 'string' ? JSON.parse(value) as unknown : value;
}

// Bloco local: `objectValue` concentra uma responsabilidade reutilizada dentro deste módulo.
function objectValue(value: unknown): JsonRecord {
// Constante ou estado local: `parsed` mantém o dado necessário ao fluxo abaixo.
    const parsed = parseJson(value);
// Condição: altera o caminho de execução somente quando a regra indicada é verdadeira.
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        throw new HttpError(500, 'INVALID_SHEET_JSON', 'JSON de ficha inválido armazenado no banco.');
    }
    return parsed as JsonRecord;
}

// Bloco local: `toTemplate` concentra uma responsabilidade reutilizada dentro deste módulo.
function toTemplate(row: TemplateRow): SheetTemplate {
// Constante ou estado local: `parsed` mantém o dado necessário ao fluxo abaixo.
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

// Bloco local: `toSheet` concentra uma responsabilidade reutilizada dentro deste módulo.
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

// Bloco local: `allFields` concentra uma responsabilidade reutilizada dentro deste módulo.
function allFields(template: SheetTemplate): SheetField[] {
    return [
        ...template.camposSchema.cabecalho,
        ...template.camposSchema.atributos,
        ...template.camposSchema.recursos,
        ...template.camposSchema.pericias,
    ];
}

// Bloco local: `normalizeFieldsSchema` concentra uma responsabilidade reutilizada dentro deste módulo.
function normalizeFieldsSchema(schema: InputSheetFieldsSchema): SheetFieldsSchema {
// Constante ou estado local: `normalize` mantém o dado necessário ao fluxo abaixo.
    const normalize = (fields: InputSheetField[]): SheetField[] => fields.map((field) => {
        const normalized: SheetField = { id: field.id, label: field.label, type: field.type };
// Condição: altera o caminho de execução somente quando a regra indicada é verdadeira.
        if (field.formula !== undefined) normalized.formula = field.formula;
// Condição: altera o caminho de execução somente quando a regra indicada é verdadeira.
        if (field.required !== undefined) normalized.required = field.required;
// Condição: altera o caminho de execução somente quando a regra indicada é verdadeira.
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

// Bloco local: `numericValues` concentra uma responsabilidade reutilizada dentro deste módulo.
function numericValues(values: JsonRecord): Record<string, unknown> {
    const result: Record<string, unknown> = {};
// Iteração: processa repetidamente os elementos ou tentativas deste bloco.
    for (const [id, value] of Object.entries(values)) {
// Condição: altera o caminho de execução somente quando a regra indicada é verdadeira.
        if (typeof value === 'object' && value !== null && !Array.isArray(value)
            && 'atual' in value && typeof value.atual === 'number') {
            result[id] = value.atual;
        } else {
            result[id] = value;
        }
    }
    return result;
}

// Bloco local: `recalculateValues` concentra uma responsabilidade reutilizada dentro deste módulo.
function recalculateValues(template: SheetTemplate, values: JsonRecord): JsonRecord {
// Constante ou estado local: `fields` mantém o dado necessário ao fluxo abaixo.
    const fields = allFields(template);
// Condição: altera o caminho de execução somente quando a regra indicada é verdadeira.
    if (detectCircularDependencies(fields)) {
        throw new HttpError(422, 'CIRCULAR_FORMULA_DEPENDENCY', 'O template contém referências circulares.');
    }

// Constante ou estado local: `formulaFields` mantém o dado necessário ao fluxo abaixo.
    const formulaFields = fields.filter((field) => field.formula !== undefined && field.formula !== null);
// Constante ou estado local: `formulasById` mantém o dado necessário ao fluxo abaixo.
    const formulasById = new Map(formulaFields.map((field) => [field.id, field]));
// Constante ou estado local: `visiting` mantém o dado necessário ao fluxo abaixo.
    const visiting = new Set<string>();
// Constante ou estado local: `calculated` mantém o dado necessário ao fluxo abaixo.
    const calculated = numericValues(values);

// Constante ou estado local: `calculate` mantém o dado necessário ao fluxo abaixo.
    const calculate = (field: SheetField): number => {
// Constante ou estado local: `existing` mantém o dado necessário ao fluxo abaixo.
        const existing = calculated[field.id];
// Condição: altera o caminho de execução somente quando a regra indicada é verdadeira.
        if (typeof existing === 'number' && field.type !== SheetFieldType.FORMULA) return existing;
// Condição: altera o caminho de execução somente quando a regra indicada é verdadeira.
        if (visiting.has(field.id)) {
            throw new HttpError(422, 'CIRCULAR_FORMULA_DEPENDENCY', 'O template contém referências circulares.');
        }
        visiting.add(field.id);
// Constante ou estado local: `dependencies` mantém o dado necessário ao fluxo abaixo.
        const dependencies = extractFormulaReferences(field.formula);
// Iteração: processa repetidamente os elementos ou tentativas deste bloco.
        for (const dependency of dependencies) {
// Constante ou estado local: `dependencyField` mantém o dado necessário ao fluxo abaixo.
            const dependencyField = formulasById.get(dependency);
// Condição: altera o caminho de execução somente quando a regra indicada é verdadeira.
            if (dependencyField) calculate(dependencyField);
        }
        let result: number;
// Bloco protegido: mantém o fluxo principal e suas finalizações ou tratamentos associados.
        try {
            result = evaluateFormula(field.formula ?? '', calculated);
        } catch (error) {
// Condição: altera o caminho de execução somente quando a regra indicada é verdadeira.
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

// Iteração: processa repetidamente os elementos ou tentativas deste bloco.
    for (const field of formulaFields) calculate(field);
    return values;
}

// Bloco local: `validateTemplateFields` concentra uma responsabilidade reutilizada dentro deste módulo.
function validateTemplateFields(fields: SheetField[]): void {
// Constante ou estado local: `ids` mantém o dado necessário ao fluxo abaixo.
    const ids = new Set(fields.map((field) => field.id));
// Iteração: processa repetidamente os elementos ou tentativas deste bloco.
    for (const field of fields) {
// Condição: altera o caminho de execução somente quando a regra indicada é verdadeira.
        if (!field.formula) continue;
// Constante ou estado local: `result` mantém o dado necessário ao fluxo abaixo.
        const result = validateFormula(field.formula, ids);
// Condição: altera o caminho de execução somente quando a regra indicada é verdadeira.
        if (!result.valid) {
// Constante ou estado local: `formulaError` mantém o dado necessário ao fluxo abaixo.
            const formulaError = result.error;
            throw new HttpError(
                422,
                formulaError?.code ?? 'INVALID_FORMULA',
                `Fórmula inválida no campo "${field.label}": ${formulaError?.message ?? 'revise a expressão.'}`,
            );
        }
    }
// Constante ou estado local: `cycle` mantém o dado necessário ao fluxo abaixo.
    const cycle = fields.length > 0 && detectCircularDependencies(fields);
// Condição: altera o caminho de execução somente quando a regra indicada é verdadeira.
    if (cycle) {
        throw new HttpError(422, 'CIRCULAR_FORMULA_DEPENDENCY', 'O template contém referências circulares.');
    }
}

// Exportação principal: `UpdateTemplateData` disponibiliza esta responsabilidade para os consumidores deste módulo.
export interface UpdateTemplateData {
    nome?: string | undefined;
    sistema?: string | null | undefined;
    camposSchema?: InputSheetFieldsSchema | undefined;
}

// Exportação principal: `CreateTemplateData` disponibiliza esta responsabilidade para os consumidores deste módulo.
export interface CreateTemplateData {
    usuarioId: string;
    nome?: string;
    sistema?: string | null;
    salaId?: string | null;
    camposSchema?: InputSheetFieldsSchema;
}

// Exportação principal: `CreateSheetData` disponibiliza esta responsabilidade para os consumidores deste módulo.
export interface CreateSheetData {
    usuarioId: string;
    templateId: string;
    nome: string;
    salaId?: string | null;
    dadosPreenchidos?: JsonRecord;
}

// Exportação principal: `TokenBarUpdate` disponibiliza esta responsabilidade para os consumidores deste módulo.
export interface TokenBarUpdate {
    tokenId: string;
    currentValue: number;
    maxValue: number;
}

// Exportação principal: `SheetService` disponibiliza esta responsabilidade para os consumidores deste módulo.
export class SheetService {
    public constructor(private readonly database: Pool = pool) {}

    public async createTemplate(data: CreateTemplateData): Promise<SheetTemplate> {
// Constante ou estado local: `camposSchema` mantém o dado necessário ao fluxo abaixo.
        const camposSchema = normalizeFieldsSchema(data.camposSchema ?? sheetFieldsSchema.parse(defaultTemplatePreset));
// Constante ou estado local: `templateFields` mantém o dado necessário ao fluxo abaixo.
        const templateFields = [
            ...camposSchema.cabecalho,
            ...camposSchema.atributos,
            ...camposSchema.recursos,
            ...camposSchema.pericias,
        ];
        validateTemplateFields(templateFields);
// Constante ou estado local: `id` mantém o dado necessário ao fluxo abaixo.
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
// Constante ou estado local: `source` mantém o dado necessário ao fluxo abaixo.
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
// Condição: altera o caminho de execução somente quando a regra indicada é verdadeira.
        if (!templateRows[0]) throw new HttpError(404, 'SHEET_TEMPLATE_NOT_FOUND', 'Template de ficha não encontrado.');
        const [roomRows] = await this.database.query<RowDataPacket[]>(
            `SELECT p.sala_id FROM participants p WHERE p.sala_id = ? AND p.usuario_id = ? AND p.papel = 'MESTRE' AND p.ativo = TRUE`,
            [roomId, userId],
        );
// Condição: altera o caminho de execução somente quando a regra indicada é verdadeira.
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
// Condição: altera o caminho de execução somente quando a regra indicada é verdadeira.
        if (!roomRows[0]) throw new HttpError(403, 'ROOM_MASTER_REQUIRED', 'Apenas o Mestre pode configurar a sala.');
        await this.database.query(
            `DELETE FROM room_sheet_templates WHERE sala_id = ? AND template_id = ?`,
            [roomId, templateId],
        );
    }

    public async updateTemplate(id: string, userId: string, data: UpdateTemplateData): Promise<SheetTemplate> {
// Condição: altera o caminho de execução somente quando a regra indicada é verdadeira.
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
// Condição: altera o caminho de execução somente quando a regra indicada é verdadeira.
        if ((result as { affectedRows: number }).affectedRows === 0) throw new HttpError(404, 'SHEET_TEMPLATE_NOT_FOUND', 'Template de ficha não encontrado.');
        return this.getTemplateById(id);
    }

    public async deleteTemplate(id: string, userId: string): Promise<void> {
// Bloco protegido: mantém o fluxo principal e suas finalizações ou tratamentos associados.
        try {
            const [result] = await this.database.query(`DELETE FROM sheet_templates WHERE id = ? AND usuario_id = ?`, [id, userId]);
// Condição: altera o caminho de execução somente quando a regra indicada é verdadeira.
            if ((result as { affectedRows: number }).affectedRows === 0) throw new HttpError(404, 'SHEET_TEMPLATE_NOT_FOUND', 'Template de ficha não encontrado.');
        } catch (error) {
// Condição: altera o caminho de execução somente quando a regra indicada é verdadeira.
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
// Constante ou estado local: `row` mantém o dado necessário ao fluxo abaixo.
        const row = rows[0];
// Condição: altera o caminho de execução somente quando a regra indicada é verdadeira.
        if (!row) throw new HttpError(404, 'SHEET_TEMPLATE_NOT_FOUND', 'Template de ficha não encontrado.');
        return toTemplate(row);
    }

    public async createSheet(data: CreateSheetData): Promise<CharacterSheet> {
// Constante ou estado local: `template` mantém o dado necessário ao fluxo abaixo.
        const template = await this.getTemplateById(data.templateId);
// Constante ou estado local: `values` mantém o dado necessário ao fluxo abaixo.
        const values = recalculateValues(template, { ...(data.dadosPreenchidos ?? {}) });
// Constante ou estado local: `id` mantém o dado necessário ao fluxo abaixo.
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
// Constante ou estado local: `source` mantém o dado necessário ao fluxo abaixo.
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
// Condição: altera o caminho de execução somente quando a regra indicada é verdadeira.
        if (!membership[0]) throw new HttpError(403, 'ROOM_ACCESS_DENIED', 'Você não participa desta sala.');
        const [result] = await this.database.query<ResultSetHeader>(
            `UPDATE character_sheets SET sala_id = ? WHERE id = ? AND usuario_id = ?`,
            [roomId, sheetId, userId],
        );
// Condição: altera o caminho de execução somente quando a regra indicada é verdadeira.
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
// Condição: altera o caminho de execução somente quando a regra indicada é verdadeira.
        if (!masterRows[0] && !ownerRows[0]) throw new HttpError(403, 'ROOM_MASTER_REQUIRED', 'Apenas o Mestre ou dono da ficha pode vinculá-la.');
        const [sheetRows] = await this.database.query<RowDataPacket[]>(
            `SELECT id FROM character_sheets WHERE id = ? AND sala_id = ?`, [sheetId, roomId],
        );
// Condição: altera o caminho de execução somente quando a regra indicada é verdadeira.
        if (!sheetRows[0]) throw new HttpError(404, 'CHARACTER_SHEET_NOT_FOUND', 'Ficha não encontrada nesta sala.');
        const [result] = await this.database.query<ResultSetHeader>(
            `UPDATE tokens t INNER JOIN scenes s ON s.id = t.cena_id INNER JOIN boards b ON b.cena_ativa_id = s.id
             SET t.character_sheet_id = ? WHERE t.id = ? AND b.sala_id = ?`,
            [sheetId, tokenId, roomId],
        );
// Condição: altera o caminho de execução somente quando a regra indicada é verdadeira.
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
// Constante ou estado local: `row` mantém o dado necessário ao fluxo abaixo.
        const row = rows[0];
// Condição: altera o caminho de execução somente quando a regra indicada é verdadeira.
        if (!row) throw new HttpError(404, 'CHARACTER_SHEET_NOT_FOUND', 'Ficha de personagem não encontrada.');
        return toSheet(row);
    }

    public async updateSheetValues(
        sheetId: string,
        userId: string,
        newValues: JsonRecord,
    ): Promise<CharacterSheet> {
// Constante ou estado local: `connection` mantém o dado necessário ao fluxo abaixo.
        const connection = await this.database.getConnection();
// Bloco protegido: mantém o fluxo principal e suas finalizações ou tratamentos associados.
        try {
            await connection.beginTransaction();
// Constante ou estado local: `sheet` mantém o dado necessário ao fluxo abaixo.
            const sheet = await this.getSheetRow(connection, sheetId, userId, true);
// Constante ou estado local: `template` mantém o dado necessário ao fluxo abaixo.
            const template = await this.getTemplateById(sheet.template_id);
// Constante ou estado local: `values` mantém o dado necessário ao fluxo abaixo.
            const values = recalculateValues(template, {
                ...objectValue(sheet.dados_preenchidos),
                ...newValues,
            });
// Consulta SQL: acessa ou altera registros no banco conforme parâmetros e condições desta instrução.
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
// Constante ou estado local: `connection` mantém o dado necessário ao fluxo abaixo.
        const connection = await this.database.getConnection();
// Bloco protegido: mantém o fluxo principal e suas finalizações ou tratamentos associados.
        try {
            await connection.beginTransaction();
// Constante ou estado local: `sheet` mantém o dado necessário ao fluxo abaixo.
            const sheet = await this.getSheetForRoom(connection, sheetId, roomId, true);
// Condição: altera o caminho de execução somente quando a regra indicada é verdadeira.
            if (sheet.usuario_id !== actorId) {
// Consulta SQL: acessa ou altera registros no banco conforme parâmetros e condições desta instrução.
                const [memberships] = await connection.query<Array<RowDataPacket & { papel: ParticipantRole }>>(
                    `SELECT p.papel
                     FROM participants p
                     INNER JOIN rooms r ON r.id = p.sala_id
                     WHERE p.sala_id = ? AND p.usuario_id = ? AND p.ativo = TRUE
                       AND r.status = 'ATIVA' LIMIT 1`,
                    [roomId, actorId],
                );
// Condição: altera o caminho de execução somente quando a regra indicada é verdadeira.
                if (memberships[0]?.papel !== ParticipantRole.MESTRE) {
                    throw new HttpError(403, 'SHEET_UPDATE_FORBIDDEN', 'Somente o dono ou o mestre pode alterar a ficha.');
                }
            }

// Constante ou estado local: `existing` mantém o dado necessário ao fluxo abaixo.
            const existing = objectValue(sheet.dados_preenchidos);
// Constante ou estado local: `previous` mantém o dado necessário ao fluxo abaixo.
            const previous = existing[fieldId];
// Constante ou estado local: `value` mantém o dado necessário ao fluxo abaixo.
            const value = typeof newValue === 'number'
                ? (typeof previous === 'object' && previous !== null && !Array.isArray(previous)
                    && 'maximo' in previous
                    ? { atual: newValue, maximo: previous.maximo }
                    : newValue)
                : newValue;
// Constante ou estado local: `updatedValues` mantém o dado necessário ao fluxo abaixo.
            const updatedValues = { ...existing, [fieldId]: value };
// Constante ou estado local: `template` mantém o dado necessário ao fluxo abaixo.
            const template = await this.getTemplateById(sheet.template_id);
// Constante ou estado local: `recalculated` mantém o dado necessário ao fluxo abaixo.
            const recalculated = recalculateValues(template, updatedValues);
// Consulta SQL: acessa ou altera registros no banco conforme parâmetros e condições desta instrução.
            await connection.query(
                `UPDATE character_sheets
                 SET dados_preenchidos = ?, versao = versao + 1
                 WHERE id = ? AND sala_id = ?`,
                [JSON.stringify(recalculated), sheetId, roomId],
            );
            await connection.commit();
// Constante ou estado local: `updatedSheet` mantém o dado necessário ao fluxo abaixo.
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
// Constante ou estado local: `row` mantém o dado necessário ao fluxo abaixo.
        const row = rows[0];
// Condição: altera o caminho de execução somente quando a regra indicada é verdadeira.
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
// Consulta SQL: acessa ou altera registros no banco conforme parâmetros e condições desta instrução.
        const [rows] = await connection.query<SheetRow[]>(
            `SELECT id, template_id, usuario_id, sala_id, nome, dados_preenchidos, versao, created_at, updated_at
             FROM character_sheets WHERE id = ? AND sala_id = ?${forUpdate ? ' FOR UPDATE' : ''}`,
            [id, roomId],
        );
// Constante ou estado local: `row` mantém o dado necessário ao fluxo abaixo.
        const row = rows[0];
// Condição: altera o caminho de execução somente quando a regra indicada é verdadeira.
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
// Iteração: processa repetidamente os elementos ou tentativas deste bloco.
        for (const row of rows) {
// Constante ou estado local: `map` mantém o dado necessário ao fluxo abaixo.
            const map = parseJson(row.status_bar_map);
// Condição: altera o caminho de execução somente quando a regra indicada é verdadeira.
            if (typeof map !== 'object' || map === null || Array.isArray(map)) continue;
// Iteração: processa repetidamente os elementos ou tentativas deste bloco.
            for (const mappingValue of Object.values(map as Record<string, unknown>)) {
// Condição: altera o caminho de execução somente quando a regra indicada é verdadeira.
                if (typeof mappingValue !== 'object' || mappingValue === null || Array.isArray(mappingValue)) continue;
// Constante ou estado local: `mapping` mantém o dado necessário ao fluxo abaixo.
                const mapping = mappingValue as Record<string, unknown>;
// Constante ou estado local: `currentField` mantém o dado necessário ao fluxo abaixo.
                const currentField = mapping.current;
// Constante ou estado local: `maximumField` mantém o dado necessário ao fluxo abaixo.
                const maximumField = mapping.maximum;
// Condição: altera o caminho de execução somente quando a regra indicada é verdadeira.
                if (typeof currentField !== 'string' || typeof maximumField !== 'string') continue;
// Condição: altera o caminho de execução somente quando a regra indicada é verdadeira.
                if (currentField !== fieldId && maximumField !== fieldId) continue;
// Constante ou estado local: `currentValue` mantém o dado necessário ao fluxo abaixo.
                const currentValue = values[currentField];
// Constante ou estado local: `maxValue` mantém o dado necessário ao fluxo abaixo.
                const maxValue = values[maximumField];
// Constante ou estado local: `currentNumber` mantém o dado necessário ao fluxo abaixo.
                const currentNumber = typeof currentValue === 'number'
                    ? currentValue
                    : typeof currentValue === 'object' && currentValue !== null
                        && !Array.isArray(currentValue)
                        && typeof (currentValue as Record<string, unknown>).atual === 'number'
                        ? (currentValue as Record<string, unknown>).atual as number
                        : undefined;
// Constante ou estado local: `maxNumber` mantém o dado necessário ao fluxo abaixo.
                const maxNumber = typeof maxValue === 'number'
                    ? maxValue
                    : typeof maxValue === 'object' && maxValue !== null
                        && !Array.isArray(maxValue)
                        && typeof (maxValue as Record<string, unknown>).maximo === 'number'
                        ? (maxValue as Record<string, unknown>).maximo as number
                        : undefined;
// Condição: altera o caminho de execução somente quando a regra indicada é verdadeira.
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
// Consulta SQL: acessa ou altera registros no banco conforme parâmetros e condições desta instrução.
        const [rows] = await connection.query<SheetRow[]>(
            `SELECT id, template_id, usuario_id, sala_id, nome, dados_preenchidos, versao, created_at, updated_at
             FROM character_sheets WHERE id = ? AND usuario_id = ?${forUpdate ? ' FOR UPDATE' : ''}`,
            [id, userId],
        );
// Constante ou estado local: `row` mantém o dado necessário ao fluxo abaixo.
        const row = rows[0];
// Condição: altera o caminho de execução somente quando a regra indicada é verdadeira.
        if (!row) throw new HttpError(404, 'CHARACTER_SHEET_NOT_FOUND', 'Ficha de personagem não encontrada.');
        return row;
    }
}

// Exportação principal: `sheetService` disponibiliza esta responsabilidade para os consumidores deste módulo.
export const sheetService = new SheetService();
