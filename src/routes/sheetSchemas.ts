import { z } from 'zod';
import { jsonObjectSchema, sheetFieldsSchema, uuidSchema } from '@motor-vtt/contracts';

export const createTemplateSchema = z.strictObject({
    nome: z.string().trim().min(1).max(160),
    sistema: z.string().trim().max(80).nullable().optional(),
    salaId: uuidSchema.nullable().optional(),
    camposSchema: sheetFieldsSchema,
});
export const createSheetSchema = z.strictObject({
    templateId: uuidSchema,
    nome: z.string().trim().min(1).max(160),
    salaId: uuidSchema.nullable().optional(),
    dadosPreenchidos: jsonObjectSchema.optional(),
});
export const sheetIdParamsSchema = z.strictObject({ id: uuidSchema });
export const updateValuesSchema = jsonObjectSchema;
export type CreateTemplateBody = z.infer<typeof createTemplateSchema>;
export type CreateSheetBody = z.infer<typeof createSheetSchema>;
export type SheetIdParams = z.infer<typeof sheetIdParamsSchema>;
export type UpdateValuesBody = z.infer<typeof updateValuesSchema>;
