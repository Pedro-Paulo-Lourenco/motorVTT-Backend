/** Define os schemas Zod para templates, fichas e vínculos de tokens. */
// Dependências deste módulo: cada importação fornece recursos, tipos ou integrações usados na implementação abaixo.
import { z } from 'zod';
import { jsonObjectSchema, sheetFieldsSchema, uuidSchema } from '@motor-vtt/contracts';

// API pública do módulo: `createTemplateSchema` define a interface pública consumida pelos demais módulos.
export const createTemplateSchema = z.strictObject({
    nome: z.string().trim().min(1).max(160).default('Template Padrão'),
    sistema: z.string().trim().max(80).nullable().optional(),
    salaId: uuidSchema.nullable().optional(),
    camposSchema: sheetFieldsSchema.optional(),
});
// API pública do módulo: `createSheetSchema` define a interface pública consumida pelos demais módulos.
export const createSheetSchema = z.strictObject({
    templateId: uuidSchema,
    nome: z.string().trim().min(1).max(160),
    salaId: uuidSchema.nullable().optional(),
    dadosPreenchidos: jsonObjectSchema.optional(),
});
// API pública do módulo: `updateTemplateSchema` define a interface pública consumida pelos demais módulos.
export const updateTemplateSchema = createTemplateSchema.partial();
// API pública do módulo: `sheetIdParamsSchema` define a interface pública consumida pelos demais módulos.
export const sheetIdParamsSchema = z.strictObject({ id: uuidSchema });
// API pública do módulo: `roomIdParamsSchema` define a interface pública consumida pelos demais módulos.
export const roomIdParamsSchema = z.strictObject({ salaId: uuidSchema });
// API pública do módulo: `roomTemplateParamsSchema` define a interface pública consumida pelos demais módulos.
export const roomTemplateParamsSchema = z.strictObject({ salaId: uuidSchema, templateId: uuidSchema });
// API pública do módulo: `updateValuesSchema` define a interface pública consumida pelos demais módulos.
export const updateValuesSchema = jsonObjectSchema;
// API pública do módulo: `linkSheetSchema` define a interface pública consumida pelos demais módulos.
export const linkSheetSchema = z.strictObject({ sheetId: uuidSchema });
// API pública do módulo: `tokenSheetParamsSchema` define a interface pública consumida pelos demais módulos.
export const tokenSheetParamsSchema = z.strictObject({ salaId: uuidSchema, tokenId: uuidSchema });
// API pública do módulo: `importSheetParamsSchema` define a interface pública consumida pelos demais módulos.
export const importSheetParamsSchema = z.strictObject({ salaId: uuidSchema, id: uuidSchema });
// API pública do módulo: `UpdateTemplateBody` define a interface pública consumida pelos demais módulos.
export type UpdateTemplateBody = z.infer<typeof updateTemplateSchema>;
// API pública do módulo: `CreateTemplateBody` define a interface pública consumida pelos demais módulos.
export type CreateTemplateBody = z.infer<typeof createTemplateSchema>;
// API pública do módulo: `CreateSheetBody` define a interface pública consumida pelos demais módulos.
export type CreateSheetBody = z.infer<typeof createSheetSchema>;
// API pública do módulo: `SheetIdParams` define a interface pública consumida pelos demais módulos.
export type SheetIdParams = z.infer<typeof sheetIdParamsSchema>;
// API pública do módulo: `RoomTemplateParams` define a interface pública consumida pelos demais módulos.
export type RoomTemplateParams = z.infer<typeof roomTemplateParamsSchema>;
// API pública do módulo: `UpdateValuesBody` define a interface pública consumida pelos demais módulos.
export type UpdateValuesBody = z.infer<typeof updateValuesSchema>;
// API pública do módulo: `LinkSheetBody` define a interface pública consumida pelos demais módulos.
export type LinkSheetBody = z.infer<typeof linkSheetSchema>;
// API pública do módulo: `TokenSheetParams` define a interface pública consumida pelos demais módulos.
export type TokenSheetParams = z.infer<typeof tokenSheetParamsSchema>;
// API pública do módulo: `ImportSheetParams` define a interface pública consumida pelos demais módulos.
export type ImportSheetParams = z.infer<typeof importSheetParamsSchema>;
