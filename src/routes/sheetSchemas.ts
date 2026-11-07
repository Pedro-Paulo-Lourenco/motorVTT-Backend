import { z } from 'zod';
import { jsonObjectSchema, sheetFieldsSchema, uuidSchema } from '@motor-vtt/contracts';

export const createTemplateSchema = z.strictObject({
    nome: z.string().trim().min(1).max(160).default('Template Padrão'),
    sistema: z.string().trim().max(80).nullable().optional(),
    salaId: uuidSchema.nullable().optional(),
    camposSchema: sheetFieldsSchema.optional(),
});
export const createSheetSchema = z.strictObject({
    templateId: uuidSchema,
    nome: z.string().trim().min(1).max(160),
    salaId: uuidSchema.nullable().optional(),
    dadosPreenchidos: jsonObjectSchema.optional(),
});
export const updateTemplateSchema = createTemplateSchema.partial();
export const sheetIdParamsSchema = z.strictObject({ id: uuidSchema });
export const roomIdParamsSchema = z.strictObject({ salaId: uuidSchema });
export const roomTemplateParamsSchema = z.strictObject({ salaId: uuidSchema, templateId: uuidSchema });
export const updateValuesSchema = jsonObjectSchema;
export const linkSheetSchema = z.strictObject({ sheetId: uuidSchema });
export const tokenSheetParamsSchema = z.strictObject({ salaId: uuidSchema, tokenId: uuidSchema });
export const importSheetParamsSchema = z.strictObject({ salaId: uuidSchema, id: uuidSchema });
export type UpdateTemplateBody = z.infer<typeof updateTemplateSchema>;
export type CreateTemplateBody = z.infer<typeof createTemplateSchema>;
export type CreateSheetBody = z.infer<typeof createSheetSchema>;
export type SheetIdParams = z.infer<typeof sheetIdParamsSchema>;
export type RoomTemplateParams = z.infer<typeof roomTemplateParamsSchema>;
export type UpdateValuesBody = z.infer<typeof updateValuesSchema>;
export type LinkSheetBody = z.infer<typeof linkSheetSchema>;
export type TokenSheetParams = z.infer<typeof tokenSheetParamsSchema>;
export type ImportSheetParams = z.infer<typeof importSheetParamsSchema>;
