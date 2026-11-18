/** Declara endpoints de templates, biblioteca e fichas de personagem. */
// Dependências deste módulo: cada importação fornece recursos, tipos ou integrações usados na implementação abaixo.
import { Router } from 'express';
import { validate } from '../http/validation.js';
import { authenticate } from '../middlewares/authenticate.js';
import { createCharacterSheet, createSheetTemplate, listSheetTemplates, updateSheetTemplate, deleteSheetTemplate, listRoomTemplates, addRoomTemplate, removeRoomTemplate, getCharacterSheet, getSheetTemplate, updateCharacterSheetValues, linkSheetToToken, getUserLibrary, cloneSheet, cloneTemplate, importCharacterSheet } from '../controllers/sheetController.js';
import { createSheetSchema, createTemplateSchema, updateTemplateSchema, sheetIdParamsSchema, roomIdParamsSchema, roomTemplateParamsSchema, updateValuesSchema, linkSheetSchema, tokenSheetParamsSchema, importSheetParamsSchema } from './sheetSchemas.js';

// Estado intermediário: `router` guarda o valor que será validado, transformado ou persistido nas etapas seguintes.
const router = Router();
// Integração HTTP: associa o método e o caminho ao middleware ou controller responsável pelo tratamento da requisição.
router.get('/api/sheet-templates', authenticate, listSheetTemplates);
// Integração HTTP: associa o método e o caminho ao middleware ou controller responsável pelo tratamento da requisição.
router.post('/api/sheet-templates', authenticate, validate({ body: createTemplateSchema }), createSheetTemplate);
// Integração HTTP: associa o método e o caminho ao middleware ou controller responsável pelo tratamento da requisição.
router.post('/api/sheet-templates/:id/clone', authenticate, validate({ params: sheetIdParamsSchema }), cloneTemplate);
// Integração HTTP: associa o método e o caminho ao middleware ou controller responsável pelo tratamento da requisição.
router.put('/api/sheet-templates/:id', authenticate, validate({ params: sheetIdParamsSchema, body: updateTemplateSchema }), updateSheetTemplate);
// Integração HTTP: associa o método e o caminho ao middleware ou controller responsável pelo tratamento da requisição.
router.delete('/api/sheet-templates/:id', authenticate, validate({ params: sheetIdParamsSchema }), deleteSheetTemplate);
// Integração HTTP: associa o método e o caminho ao middleware ou controller responsável pelo tratamento da requisição.
router.get('/api/rooms/:salaId/templates', authenticate, validate({ params: roomIdParamsSchema }), listRoomTemplates);
// Integração HTTP: associa o método e o caminho ao middleware ou controller responsável pelo tratamento da requisição.
router.post('/api/rooms/:salaId/templates/:templateId', authenticate, validate({ params: roomTemplateParamsSchema }), addRoomTemplate);
// Integração HTTP: associa o método e o caminho ao middleware ou controller responsável pelo tratamento da requisição.
router.delete('/api/rooms/:salaId/templates/:templateId', authenticate, validate({ params: roomTemplateParamsSchema }), removeRoomTemplate);
// Integração HTTP: associa o método e o caminho ao middleware ou controller responsável pelo tratamento da requisição.
router.get('/api/sheet-templates/:id', authenticate, validate({ params: sheetIdParamsSchema }), getSheetTemplate);
// Integração HTTP: associa o método e o caminho ao middleware ou controller responsável pelo tratamento da requisição.
router.get('/api/character-sheets/:id', authenticate, validate({ params: sheetIdParamsSchema }), getCharacterSheet);
// Integração HTTP: associa o método e o caminho ao middleware ou controller responsável pelo tratamento da requisição.
router.post('/api/character-sheets', authenticate, validate({ body: createSheetSchema }), createCharacterSheet);
// Integração HTTP: associa o método e o caminho ao middleware ou controller responsável pelo tratamento da requisição.
router.post('/api/character-sheets/:id/clone', authenticate, validate({ params: sheetIdParamsSchema }), cloneSheet);
// Integração HTTP: associa o método e o caminho ao middleware ou controller responsável pelo tratamento da requisição.
router.put('/api/rooms/:salaId/tokens/:tokenId/sheet', authenticate, validate({ params: tokenSheetParamsSchema, body: linkSheetSchema }), linkSheetToToken);
// Integração HTTP: associa o método e o caminho ao middleware ou controller responsável pelo tratamento da requisição.
router.put('/api/character-sheets/:id/values', authenticate, validate({ params: sheetIdParamsSchema, body: updateValuesSchema }), updateCharacterSheetValues);
// Integração HTTP: associa o método e o caminho ao middleware ou controller responsável pelo tratamento da requisição.
router.get('/api/user/library', authenticate, getUserLibrary);
// Integração HTTP: associa o método e o caminho ao middleware ou controller responsável pelo tratamento da requisição.
router.post('/api/rooms/:salaId/character-sheets/:id/import', authenticate, validate({ params: importSheetParamsSchema }), importCharacterSheet);

export default router;
