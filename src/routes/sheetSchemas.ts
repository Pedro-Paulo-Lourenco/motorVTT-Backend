/** Define os schemas Zod para templates, fichas e vínculos de tokens. */
// Importações: reúnem bibliotecas, tipos e módulos locais usados pelos blocos seguintes.
import { z } from 'zod';
import { jsonObjectSchema, sheetFieldsSchema, uuidSchema } from '@motor-vtt/contracts';

// Exportação principal: `createTemplateSchema` disponibiliza esta responsabilidade para os consumidores deste módulo.
export const createTemplateSchema = z.strictObject({
    nome: z.string().trim().min(1).max(160).default('Template Padrão'),
    sistema: z.string().trim().max(80).nullable().optional(),
    salaId: uuidSchema.nullable().optional(),
    camposSchema: sheetFieldsSchema.optional(),
});
// Exportação principal: `createSheetSchema` disponibiliza esta responsabilidade para os consumidores deste módulo.
export const createSheetSchema = z.strictObject({
    templateId: uuidSchema,
    nome: z.string().trim().min(1).max(160),
    salaId: uuidSchema.nullable().optional(),
    dadosPreenchidos: jsonObjectSchema.optional(),
});
// Exportação principal: `updateTemplateSchema` disponibiliza esta responsabilidade para os consumidores deste módulo.
export const updateTemplateSchema = createTemplateSchema.partial();
// Exportação principal: `sheetIdParamsSchema` disponibiliza esta responsabilidade para os consumidores deste módulo.
export const sheetIdParamsSchema = z.strictObject({ id: uuidSchema });
// Exportação principal: `roomIdParamsSchema` disponibiliza esta responsabilidade para os consumidores deste módulo.
export const roomIdParamsSchema = z.strictObject({ salaId: uuidSchema });
// Exportação principal: `roomTemplateParamsSchema` disponibiliza esta responsabilidade para os consumidores deste módulo.
export const roomTemplateParamsSchema = z.strictObject({ salaId: uuidSchema, templateId: uuidSchema });
// Exportação principal: `updateValuesSchema` disponibiliza esta responsabilidade para os consumidores deste módulo.
export const updateValuesSchema = jsonObjectSchema;
// Exportação principal: `linkSheetSchema` disponibiliza esta responsabilidade para os consumidores deste módulo.
export const linkSheetSchema = z.strictObject({ sheetId: uuidSchema });
// Exportação principal: `tokenSheetParamsSchema` disponibiliza esta responsabilidade para os consumidores deste módulo.
export const tokenSheetParamsSchema = z.strictObject({ salaId: uuidSchema, tokenId: uuidSchema });
// Exportação principal: `importSheetParamsSchema` disponibiliza esta responsabilidade para os consumidores deste módulo.
export const importSheetParamsSchema = z.strictObject({ salaId: uuidSchema, id: uuidSchema });
// Exportação principal: `UpdateTemplateBody` disponibiliza esta responsabilidade para os consumidores deste módulo.
export type UpdateTemplateBody = z.infer<typeof updateTemplateSchema>;
// Exportação principal: `CreateTemplateBody` disponibiliza esta responsabilidade para os consumidores deste módulo.
export type CreateTemplateBody = z.infer<typeof createTemplateSchema>;
// Exportação principal: `CreateSheetBody` disponibiliza esta responsabilidade para os consumidores deste módulo.
export type CreateSheetBody = z.infer<typeof createSheetSchema>;
// Exportação principal: `SheetIdParams` disponibiliza esta responsabilidade para os consumidores deste módulo.
export type SheetIdParams = z.infer<typeof sheetIdParamsSchema>;
// Exportação principal: `RoomTemplateParams` disponibiliza esta responsabilidade para os consumidores deste módulo.
export type RoomTemplateParams = z.infer<typeof roomTemplateParamsSchema>;
// Exportação principal: `UpdateValuesBody` disponibiliza esta responsabilidade para os consumidores deste módulo.
export type UpdateValuesBody = z.infer<typeof updateValuesSchema>;
// Exportação principal: `LinkSheetBody` disponibiliza esta responsabilidade para os consumidores deste módulo.
export type LinkSheetBody = z.infer<typeof linkSheetSchema>;
// Exportação principal: `TokenSheetParams` disponibiliza esta responsabilidade para os consumidores deste módulo.
export type TokenSheetParams = z.infer<typeof tokenSheetParamsSchema>;
// Exportação principal: `ImportSheetParams` disponibiliza esta responsabilidade para os consumidores deste módulo.
export type ImportSheetParams = z.infer<typeof importSheetParamsSchema>;
