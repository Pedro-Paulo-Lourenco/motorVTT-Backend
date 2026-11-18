/** Encapsula o ciclo de vida de templates e fichas de personagem. */
// Dependências deste módulo: cada importação fornece recursos, tipos ou integrações usados na implementação abaixo.
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
// Contrato de dados: `CharacterSheet` documenta o formato e o significado dos dados trocados entre as camadas relacionadas.
    type CharacterSheet,
// Contrato de dados: `JsonObject` documenta o formato e o significado dos dados trocados entre as camadas relacionadas.
    type JsonObject,
// Contrato de dados: `SheetField` documenta o formato e o significado dos dados trocados entre as camadas relacionadas.
    type SheetField,
// Contrato de dados: `SheetFieldsSchema` documenta o formato e o significado dos dados trocados entre as camadas relacionadas.
    type SheetFieldsSchema,
// Contrato de dados: `SheetTemplate` documenta o formato e o significado dos dados trocados entre as camadas relacionadas.
    type SheetTemplate,
} from '@motor-vtt/contracts';
import type { Pool, PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';

import pool from '../config/database.js';
import { HttpError } from '../http/errors.js';

// Contrato de dados: `JsonRecord` documenta o formato e o significado dos dados trocados entre as camadas relacionadas.
type JsonRecord = Record<string, unknown>;
// Contrato de dados: `InputSheetField` documenta o formato e o significado dos dados trocados entre as camadas relacionadas.
type InputSheetField = Omit<SheetField, 'formula' | 'required' | 'attributeId'> & {
    formula?: string | null | undefined;
    required?: boolean | undefined;
    attributeId?: string | null | undefined;
};
// Contrato de dados: `InputSheetFieldsSchema` documenta o formato e o significado dos dados trocados entre as camadas relacionadas.
type InputSheetFieldsSchema = {
    cabecalho: InputSheetField[];
    atributos: InputSheetField[];
    recursos: InputSheetField[];
    pericias: InputSheetField[];
};

// Contrato de dados: `TemplateRow` documenta o formato e o significado dos dados trocados entre as camadas relacionadas.
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

// Contrato de dados: `SheetRow` documenta o formato e o significado dos dados trocados entre as camadas relacionadas.
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

// Contrato de dados: `TokenBarRow` documenta o formato e o significado dos dados trocados entre as camadas relacionadas.
type TokenBarRow = RowDataPacket & {
    id: string;
    status_bar_map: unknown;
};

// Função auxiliar: `parseJson` isola uma responsabilidade reutilizada neste módulo.
function parseJson(value: unknown): unknown {
    return typeof value === 'string' ? JSON.parse(value) as unknown : value;
}

// Função auxiliar: `objectValue` isola uma responsabilidade reutilizada neste módulo.
function objectValue(value: unknown): JsonRecord {
// Estado intermediário: `parsed` guarda o valor que será validado, transformado ou persistido nas etapas seguintes.
    const parsed = parseJson(value);
// Regra de negócio: a validação abaixo decide se o fluxo pode continuar ou deve retornar antecipadamente.
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        throw new HttpError(500, 'INVALID_SHEET_JSON', 'JSON de ficha inválido armazenado no banco.');
    }
    return parsed as JsonRecord;
}

// Função auxiliar: `toTemplate` isola uma responsabilidade reutilizada neste módulo.
function toTemplate(row: TemplateRow): SheetTemplate {
// Estado intermediário: `parsed` guarda o valor que será validado, transformado ou persistido nas etapas seguintes.
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

// Função auxiliar: `toSheet` isola uma responsabilidade reutilizada neste módulo.
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

// Função auxiliar: `allFields` isola uma responsabilidade reutilizada neste módulo.
function allFields(template: SheetTemplate): SheetField[] {
    return [
        ...template.camposSchema.cabecalho,
        ...template.camposSchema.atributos,
        ...template.camposSchema.recursos,
        ...template.camposSchema.pericias,
    ];
}

// Função auxiliar: `normalizeFieldsSchema` isola uma responsabilidade reutilizada neste módulo.
function normalizeFieldsSchema(schema: InputSheetFieldsSchema): SheetFieldsSchema {
// Estado intermediário: `normalize` guarda o valor que será validado, transformado ou persistido nas etapas seguintes.
    const normalize = (fields: InputSheetField[]): SheetField[] => fields.map((field) => {
        const normalized: SheetField = { id: field.id, label: field.label, type: field.type };
// Regra de negócio: a validação abaixo decide se o fluxo pode continuar ou deve retornar antecipadamente.
        if (field.formula !== undefined) normalized.formula = field.formula;
// Regra de negócio: a validação abaixo decide se o fluxo pode continuar ou deve retornar antecipadamente.
        if (field.required !== undefined) normalized.required = field.required;
// Regra de negócio: a validação abaixo decide se o fluxo pode continuar ou deve retornar antecipadamente.
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

// Função auxiliar: `numericValues` isola uma responsabilidade reutilizada neste módulo.
function numericValues(values: JsonRecord): Record<string, unknown> {
    const result: Record<string, unknown> = {};
// Iteração: percorre todos os elementos para aplicar a mesma regra a cada item.
    for (const [id, value] of Object.entries(values)) {
// Regra de negócio: a validação abaixo decide se o fluxo pode continuar ou deve retornar antecipadamente.
        if (typeof value === 'object' && value !== null && !Array.isArray(value)
            && 'atual' in value && typeof value.atual === 'number') {
            result[id] = value.atual;
        } else {
            result[id] = value;
        }
    }
    return result;
}

// Função auxiliar: `recalculateValues` isola uma responsabilidade reutilizada neste módulo.
function recalculateValues(template: SheetTemplate, values: JsonRecord): JsonRecord {
// Estado intermediário: `fields` guarda o valor que será validado, transformado ou persistido nas etapas seguintes.
    const fields = allFields(template);
// Regra de negócio: a validação abaixo decide se o fluxo pode continuar ou deve retornar antecipadamente.
    if (detectCircularDependencies(fields)) {
        throw new HttpError(422, 'CIRCULAR_FORMULA_DEPENDENCY', 'O template contém referências circulares.');
    }

// Estado intermediário: `formulaFields` guarda o valor que será validado, transformado ou persistido nas etapas seguintes.
    const formulaFields = fields.filter((field) => field.formula !== undefined && field.formula !== null);
// Estado intermediário: `formulasById` guarda o valor que será validado, transformado ou persistido nas etapas seguintes.
    const formulasById = new Map(formulaFields.map((field) => [field.id, field]));
// Estado intermediário: `visiting` guarda o valor que será validado, transformado ou persistido nas etapas seguintes.
    const visiting = new Set<string>();
// Estado intermediário: `calculated` guarda o valor que será validado, transformado ou persistido nas etapas seguintes.
    const calculated = numericValues(values);

// Estado intermediário: `calculate` guarda o valor que será validado, transformado ou persistido nas etapas seguintes.
    const calculate = (field: SheetField): number => {
// Estado intermediário: `existing` guarda o valor que será validado, transformado ou persistido nas etapas seguintes.
        const existing = calculated[field.id];
// Regra de negócio: a validação abaixo decide se o fluxo pode continuar ou deve retornar antecipadamente.
        if (typeof existing === 'number' && field.type !== SheetFieldType.FORMULA) return existing;
// Regra de negócio: a validação abaixo decide se o fluxo pode continuar ou deve retornar antecipadamente.
        if (visiting.has(field.id)) {
            throw new HttpError(422, 'CIRCULAR_FORMULA_DEPENDENCY', 'O template contém referências circulares.');
        }
        visiting.add(field.id);
// Estado intermediário: `dependencies` guarda o valor que será validado, transformado ou persistido nas etapas seguintes.
        const dependencies = extractFormulaReferences(field.formula);
// Iteração: percorre todos os elementos para aplicar a mesma regra a cada item.
        for (const dependency of dependencies) {
// Estado intermediário: `dependencyField` guarda o valor que será validado, transformado ou persistido nas etapas seguintes.
            const dependencyField = formulasById.get(dependency);
// Regra de negócio: a validação abaixo decide se o fluxo pode continuar ou deve retornar antecipadamente.
            if (dependencyField) calculate(dependencyField);
        }
        let result: number;
// Tratamento protegido: garante que o recurso seja finalizado e que erros sigam para o fluxo central de tratamento.
        try {
            result = evaluateFormula(field.formula ?? '', calculated);
        } catch (error) {
// Regra de negócio: a validação abaixo decide se o fluxo pode continuar ou deve retornar antecipadamente.
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

// Iteração: percorre todos os elementos para aplicar a mesma regra a cada item.
    for (const field of formulaFields) calculate(field);
    return values;
}

// Função auxiliar: `validateTemplateFields` isola uma responsabilidade reutilizada neste módulo.
function validateTemplateFields(fields: SheetField[]): void {
// Estado intermediário: `ids` guarda o valor que será validado, transformado ou persistido nas etapas seguintes.
    const ids = new Set(fields.map((field) => field.id));
// Iteração: percorre todos os elementos para aplicar a mesma regra a cada item.
    for (const field of fields) {
// Regra de negócio: a validação abaixo decide se o fluxo pode continuar ou deve retornar antecipadamente.
        if (!field.formula) continue;
// Estado intermediário: `result` guarda o valor que será validado, transformado ou persistido nas etapas seguintes.
        const result = validateFormula(field.formula, ids);
// Regra de negócio: a validação abaixo decide se o fluxo pode continuar ou deve retornar antecipadamente.
        if (!result.valid) {
// Estado intermediário: `formulaError` guarda o valor que será validado, transformado ou persistido nas etapas seguintes.
            const formulaError = result.error;
            throw new HttpError(
                422,
                formulaError?.code ?? 'INVALID_FORMULA',
                `Fórmula inválida no campo "${field.label}": ${formulaError?.message ?? 'revise a expressão.'}`,
            );
        }
    }
// Estado intermediário: `cycle` guarda o valor que será validado, transformado ou persistido nas etapas seguintes.
    const cycle = fields.length > 0 && detectCircularDependencies(fields);
// Regra de negócio: a validação abaixo decide se o fluxo pode continuar ou deve retornar antecipadamente.
    if (cycle) {
        throw new HttpError(422, 'CIRCULAR_FORMULA_DEPENDENCY', 'O template contém referências circulares.');
    }
}

// API pública do módulo: `UpdateTemplateData` define a interface pública consumida pelos demais módulos.
export interface UpdateTemplateData {
    nome?: string | undefined;
    sistema?: string | null | undefined;
    camposSchema?: InputSheetFieldsSchema | undefined;
}

// API pública do módulo: `CreateTemplateData` define a interface pública consumida pelos demais módulos.
export interface CreateTemplateData {
    usuarioId: string;
    nome?: string;
    sistema?: string | null;
    salaId?: string | null;
    camposSchema?: InputSheetFieldsSchema;
}

// API pública do módulo: `CreateSheetData` define a interface pública consumida pelos demais módulos.
export interface CreateSheetData {
    usuarioId: string;
    templateId: string;
    nome: string;
    salaId?: string | null;
    dadosPreenchidos?: JsonRecord;
}

// API pública do módulo: `TokenBarUpdate` define a interface pública consumida pelos demais módulos.
export interface TokenBarUpdate {
    tokenId: string;
    currentValue: number;
    maxValue: number;
}

// API pública do módulo: `SheetService` define a interface pública consumida pelos demais módulos.
export class SheetService {
    public constructor(private readonly database: Pool = pool) {}

    public async createTemplate(data: CreateTemplateData): Promise<SheetTemplate> {
// Estado intermediário: `camposSchema` guarda o valor que será validado, transformado ou persistido nas etapas seguintes.
        const camposSchema = normalizeFieldsSchema(data.camposSchema ?? sheetFieldsSchema.parse(defaultTemplatePreset));
// Estado intermediário: `templateFields` guarda o valor que será validado, transformado ou persistido nas etapas seguintes.
        const templateFields = [
            ...camposSchema.cabecalho,
            ...camposSchema.atributos,
            ...camposSchema.recursos,
            ...camposSchema.pericias,
        ];
        validateTemplateFields(templateFields);
// Estado intermediário: `id` guarda o valor que será validado, transformado ou persistido nas etapas seguintes.
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
// Estado intermediário: `source` guarda o valor que será validado, transformado ou persistido nas etapas seguintes.
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
// Regra de negócio: a validação abaixo decide se o fluxo pode continuar ou deve retornar antecipadamente.
        if (!templateRows[0]) throw new HttpError(404, 'SHEET_TEMPLATE_NOT_FOUND', 'Template de ficha não encontrado.');
        const [roomRows] = await this.database.query<RowDataPacket[]>(
            `SELECT p.sala_id FROM participants p WHERE p.sala_id = ? AND p.usuario_id = ? AND p.papel = 'MESTRE' AND p.ativo = TRUE`,
            [roomId, userId],
        );
// Regra de negócio: a validação abaixo decide se o fluxo pode continuar ou deve retornar antecipadamente.
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
// Regra de negócio: a validação abaixo decide se o fluxo pode continuar ou deve retornar antecipadamente.
        if (!roomRows[0]) throw new HttpError(403, 'ROOM_MASTER_REQUIRED', 'Apenas o Mestre pode configurar a sala.');
        await this.database.query(
            `DELETE FROM room_sheet_templates WHERE sala_id = ? AND template_id = ?`,
            [roomId, templateId],
        );
    }

    public async updateTemplate(id: string, userId: string, data: UpdateTemplateData): Promise<SheetTemplate> {
// Regra de negócio: a validação abaixo decide se o fluxo pode continuar ou deve retornar antecipadamente.
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
// Regra de negócio: a validação abaixo decide se o fluxo pode continuar ou deve retornar antecipadamente.
        if ((result as { affectedRows: number }).affectedRows === 0) throw new HttpError(404, 'SHEET_TEMPLATE_NOT_FOUND', 'Template de ficha não encontrado.');
        return this.getTemplateById(id);
    }

    public async deleteTemplate(id: string, userId: string): Promise<void> {
// Tratamento protegido: garante que o recurso seja finalizado e que erros sigam para o fluxo central de tratamento.
        try {
            const [result] = await this.database.query(`DELETE FROM sheet_templates WHERE id = ? AND usuario_id = ?`, [id, userId]);
// Regra de negócio: a validação abaixo decide se o fluxo pode continuar ou deve retornar antecipadamente.
            if ((result as { affectedRows: number }).affectedRows === 0) throw new HttpError(404, 'SHEET_TEMPLATE_NOT_FOUND', 'Template de ficha não encontrado.');
        } catch (error) {
// Regra de negócio: a validação abaixo decide se o fluxo pode continuar ou deve retornar antecipadamente.
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
// Estado intermediário: `row` guarda o valor que será validado, transformado ou persistido nas etapas seguintes.
        const row = rows[0];
// Regra de negócio: a validação abaixo decide se o fluxo pode continuar ou deve retornar antecipadamente.
        if (!row) throw new HttpError(404, 'SHEET_TEMPLATE_NOT_FOUND', 'Template de ficha não encontrado.');
        return toTemplate(row);
    }

    public async createSheet(data: CreateSheetData): Promise<CharacterSheet> {
// Estado intermediário: `template` guarda o valor que será validado, transformado ou persistido nas etapas seguintes.
        const template = await this.getTemplateById(data.templateId);
// Estado intermediário: `values` guarda o valor que será validado, transformado ou persistido nas etapas seguintes.
        const values = recalculateValues(template, { ...(data.dadosPreenchidos ?? {}) });
// Estado intermediário: `id` guarda o valor que será validado, transformado ou persistido nas etapas seguintes.
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
// Estado intermediário: `source` guarda o valor que será validado, transformado ou persistido nas etapas seguintes.
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
// Regra de negócio: a validação abaixo decide se o fluxo pode continuar ou deve retornar antecipadamente.
        if (!membership[0]) throw new HttpError(403, 'ROOM_ACCESS_DENIED', 'Você não participa desta sala.');
        const [result] = await this.database.query<ResultSetHeader>(
            `UPDATE character_sheets SET sala_id = ? WHERE id = ? AND usuario_id = ?`,
            [roomId, sheetId, userId],
        );
// Regra de negócio: a validação abaixo decide se o fluxo pode continuar ou deve retornar antecipadamente.
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
// Regra de negócio: a validação abaixo decide se o fluxo pode continuar ou deve retornar antecipadamente.
        if (!masterRows[0] && !ownerRows[0]) throw new HttpError(403, 'ROOM_MASTER_REQUIRED', 'Apenas o Mestre ou dono da ficha pode vinculá-la.');
        const [sheetRows] = await this.database.query<RowDataPacket[]>(
            `SELECT id FROM character_sheets WHERE id = ? AND sala_id = ?`, [sheetId, roomId],
        );
// Regra de negócio: a validação abaixo decide se o fluxo pode continuar ou deve retornar antecipadamente.
        if (!sheetRows[0]) throw new HttpError(404, 'CHARACTER_SHEET_NOT_FOUND', 'Ficha não encontrada nesta sala.');
        const [result] = await this.database.query<ResultSetHeader>(
            `UPDATE tokens t INNER JOIN scenes s ON s.id = t.cena_id INNER JOIN boards b ON b.cena_ativa_id = s.id
             SET t.character_sheet_id = ? WHERE t.id = ? AND b.sala_id = ?`,
            [sheetId, tokenId, roomId],
        );
// Regra de negócio: a validação abaixo decide se o fluxo pode continuar ou deve retornar antecipadamente.
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
// Estado intermediário: `row` guarda o valor que será validado, transformado ou persistido nas etapas seguintes.
        const row = rows[0];
// Regra de negócio: a validação abaixo decide se o fluxo pode continuar ou deve retornar antecipadamente.
        if (!row) throw new HttpError(404, 'CHARACTER_SHEET_NOT_FOUND', 'Ficha de personagem não encontrada.');
        return toSheet(row);
    }

    public async updateSheetValues(
        sheetId: string,
        userId: string,
        newValues: JsonRecord,
    ): Promise<CharacterSheet> {
// Estado intermediário: `connection` guarda o valor que será validado, transformado ou persistido nas etapas seguintes.
        const connection = await this.database.getConnection();
// Tratamento protegido: garante que o recurso seja finalizado e que erros sigam para o fluxo central de tratamento.
        try {
            await connection.beginTransaction();
// Estado intermediário: `sheet` guarda o valor que será validado, transformado ou persistido nas etapas seguintes.
            const sheet = await this.getSheetRow(connection, sheetId, userId, true);
// Estado intermediário: `template` guarda o valor que será validado, transformado ou persistido nas etapas seguintes.
            const template = await this.getTemplateById(sheet.template_id);
// Estado intermediário: `values` guarda o valor que será validado, transformado ou persistido nas etapas seguintes.
            const values = recalculateValues(template, {
                ...objectValue(sheet.dados_preenchidos),
                ...newValues,
            });
// Persistência: esta consulta lê ou altera os registros necessários para manter o estado da aplicação consistente.
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
// Estado intermediário: `connection` guarda o valor que será validado, transformado ou persistido nas etapas seguintes.
        const connection = await this.database.getConnection();
// Tratamento protegido: garante que o recurso seja finalizado e que erros sigam para o fluxo central de tratamento.
        try {
            await connection.beginTransaction();
// Estado intermediário: `sheet` guarda o valor que será validado, transformado ou persistido nas etapas seguintes.
            const sheet = await this.getSheetForRoom(connection, sheetId, roomId, true);
// Regra de negócio: a validação abaixo decide se o fluxo pode continuar ou deve retornar antecipadamente.
            if (sheet.usuario_id !== actorId) {
// Persistência: esta consulta lê ou altera os registros necessários para manter o estado da aplicação consistente.
                const [memberships] = await connection.query<Array<RowDataPacket & { papel: ParticipantRole }>>(
                    `SELECT p.papel
                     FROM participants p
                     INNER JOIN rooms r ON r.id = p.sala_id
                     WHERE p.sala_id = ? AND p.usuario_id = ? AND p.ativo = TRUE
                       AND r.status = 'ATIVA' LIMIT 1`,
                    [roomId, actorId],
                );
// Regra de negócio: a validação abaixo decide se o fluxo pode continuar ou deve retornar antecipadamente.
                if (memberships[0]?.papel !== ParticipantRole.MESTRE) {
                    throw new HttpError(403, 'SHEET_UPDATE_FORBIDDEN', 'Somente o dono ou o mestre pode alterar a ficha.');
                }
            }

// Estado intermediário: `existing` guarda o valor que será validado, transformado ou persistido nas etapas seguintes.
            const existing = objectValue(sheet.dados_preenchidos);
// Estado intermediário: `previous` guarda o valor que será validado, transformado ou persistido nas etapas seguintes.
            const previous = existing[fieldId];
// Estado intermediário: `value` guarda o valor que será validado, transformado ou persistido nas etapas seguintes.
            const value = typeof newValue === 'number'
                ? (typeof previous === 'object' && previous !== null && !Array.isArray(previous)
                    && 'maximo' in previous
                    ? { atual: newValue, maximo: previous.maximo }
                    : newValue)
                : newValue;
// Estado intermediário: `updatedValues` guarda o valor que será validado, transformado ou persistido nas etapas seguintes.
            const updatedValues = { ...existing, [fieldId]: value };
// Estado intermediário: `template` guarda o valor que será validado, transformado ou persistido nas etapas seguintes.
            const template = await this.getTemplateById(sheet.template_id);
// Estado intermediário: `recalculated` guarda o valor que será validado, transformado ou persistido nas etapas seguintes.
            const recalculated = recalculateValues(template, updatedValues);
// Persistência: esta consulta lê ou altera os registros necessários para manter o estado da aplicação consistente.
            await connection.query(
                `UPDATE character_sheets
                 SET dados_preenchidos = ?, versao = versao + 1
                 WHERE id = ? AND sala_id = ?`,
                [JSON.stringify(recalculated), sheetId, roomId],
            );
            await connection.commit();
// Estado intermediário: `updatedSheet` guarda o valor que será validado, transformado ou persistido nas etapas seguintes.
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
// Estado intermediário: `row` guarda o valor que será validado, transformado ou persistido nas etapas seguintes.
        const row = rows[0];
// Regra de negócio: a validação abaixo decide se o fluxo pode continuar ou deve retornar antecipadamente.
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
// Persistência: esta consulta lê ou altera os registros necessários para manter o estado da aplicação consistente.
        const [rows] = await connection.query<SheetRow[]>(
            `SELECT id, template_id, usuario_id, sala_id, nome, dados_preenchidos, versao, created_at, updated_at
             FROM character_sheets WHERE id = ? AND sala_id = ?${forUpdate ? ' FOR UPDATE' : ''}`,
            [id, roomId],
        );
// Estado intermediário: `row` guarda o valor que será validado, transformado ou persistido nas etapas seguintes.
        const row = rows[0];
// Regra de negócio: a validação abaixo decide se o fluxo pode continuar ou deve retornar antecipadamente.
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
// Iteração: percorre todos os elementos para aplicar a mesma regra a cada item.
        for (const row of rows) {
// Estado intermediário: `map` guarda o valor que será validado, transformado ou persistido nas etapas seguintes.
            const map = parseJson(row.status_bar_map);
// Regra de negócio: a validação abaixo decide se o fluxo pode continuar ou deve retornar antecipadamente.
            if (typeof map !== 'object' || map === null || Array.isArray(map)) continue;
// Iteração: percorre todos os elementos para aplicar a mesma regra a cada item.
            for (const mappingValue of Object.values(map as Record<string, unknown>)) {
// Regra de negócio: a validação abaixo decide se o fluxo pode continuar ou deve retornar antecipadamente.
                if (typeof mappingValue !== 'object' || mappingValue === null || Array.isArray(mappingValue)) continue;
// Estado intermediário: `mapping` guarda o valor que será validado, transformado ou persistido nas etapas seguintes.
                const mapping = mappingValue as Record<string, unknown>;
// Estado intermediário: `currentField` guarda o valor que será validado, transformado ou persistido nas etapas seguintes.
                const currentField = mapping.current;
// Estado intermediário: `maximumField` guarda o valor que será validado, transformado ou persistido nas etapas seguintes.
                const maximumField = mapping.maximum;
// Regra de negócio: a validação abaixo decide se o fluxo pode continuar ou deve retornar antecipadamente.
                if (typeof currentField !== 'string' || typeof maximumField !== 'string') continue;
// Regra de negócio: a validação abaixo decide se o fluxo pode continuar ou deve retornar antecipadamente.
                if (currentField !== fieldId && maximumField !== fieldId) continue;
// Estado intermediário: `currentValue` guarda o valor que será validado, transformado ou persistido nas etapas seguintes.
                const currentValue = values[currentField];
// Estado intermediário: `maxValue` guarda o valor que será validado, transformado ou persistido nas etapas seguintes.
                const maxValue = values[maximumField];
// Estado intermediário: `currentNumber` guarda o valor que será validado, transformado ou persistido nas etapas seguintes.
                const currentNumber = typeof currentValue === 'number'
                    ? currentValue
                    : typeof currentValue === 'object' && currentValue !== null
                        && !Array.isArray(currentValue)
                        && typeof (currentValue as Record<string, unknown>).atual === 'number'
                        ? (currentValue as Record<string, unknown>).atual as number
                        : undefined;
// Estado intermediário: `maxNumber` guarda o valor que será validado, transformado ou persistido nas etapas seguintes.
                const maxNumber = typeof maxValue === 'number'
                    ? maxValue
                    : typeof maxValue === 'object' && maxValue !== null
                        && !Array.isArray(maxValue)
                        && typeof (maxValue as Record<string, unknown>).maximo === 'number'
                        ? (maxValue as Record<string, unknown>).maximo as number
                        : undefined;
// Regra de negócio: a validação abaixo decide se o fluxo pode continuar ou deve retornar antecipadamente.
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
// Persistência: esta consulta lê ou altera os registros necessários para manter o estado da aplicação consistente.
        const [rows] = await connection.query<SheetRow[]>(
            `SELECT id, template_id, usuario_id, sala_id, nome, dados_preenchidos, versao, created_at, updated_at
             FROM character_sheets WHERE id = ? AND usuario_id = ?${forUpdate ? ' FOR UPDATE' : ''}`,
            [id, userId],
        );
// Estado intermediário: `row` guarda o valor que será validado, transformado ou persistido nas etapas seguintes.
        const row = rows[0];
// Regra de negócio: a validação abaixo decide se o fluxo pode continuar ou deve retornar antecipadamente.
        if (!row) throw new HttpError(404, 'CHARACTER_SHEET_NOT_FOUND', 'Ficha de personagem não encontrada.');
        return row;
    }
}

// API pública do módulo: `sheetService` define a interface pública consumida pelos demais módulos.
export const sheetService = new SheetService();
