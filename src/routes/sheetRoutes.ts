/** Declara endpoints de templates, biblioteca e fichas de personagem. */
// Importações: reúnem bibliotecas, tipos e módulos locais usados pelos blocos seguintes.
import { Router } from 'express';
import { validate } from '../http/validation.js';
import { authenticate } from '../middlewares/authenticate.js';
import { createCharacterSheet, createSheetTemplate, listSheetTemplates, updateSheetTemplate, deleteSheetTemplate, listRoomTemplates, addRoomTemplate, removeRoomTemplate, getCharacterSheet, getSheetTemplate, updateCharacterSheetValues, linkSheetToToken, getUserLibrary, cloneSheet, cloneTemplate, importCharacterSheet } from '../controllers/sheetController.js';
import { createSheetSchema, createTemplateSchema, updateTemplateSchema, sheetIdParamsSchema, roomIdParamsSchema, roomTemplateParamsSchema, updateValuesSchema, linkSheetSchema, tokenSheetParamsSchema, importSheetParamsSchema } from './sheetSchemas.js';

// Constante ou estado local: `router` mantém o dado necessário ao fluxo abaixo.
const router = Router();
// Registro de rota/middleware: conecta método e caminho ao tratamento HTTP correspondente.
router.get('/api/sheet-templates', authenticate, listSheetTemplates);
// Registro de rota/middleware: conecta método e caminho ao tratamento HTTP correspondente.
router.post('/api/sheet-templates', authenticate, validate({ body: createTemplateSchema }), createSheetTemplate);
// Registro de rota/middleware: conecta método e caminho ao tratamento HTTP correspondente.
router.post('/api/sheet-templates/:id/clone', authenticate, validate({ params: sheetIdParamsSchema }), cloneTemplate);
// Registro de rota/middleware: conecta método e caminho ao tratamento HTTP correspondente.
router.put('/api/sheet-templates/:id', authenticate, validate({ params: sheetIdParamsSchema, body: updateTemplateSchema }), updateSheetTemplate);
// Registro de rota/middleware: conecta método e caminho ao tratamento HTTP correspondente.
router.delete('/api/sheet-templates/:id', authenticate, validate({ params: sheetIdParamsSchema }), deleteSheetTemplate);
// Registro de rota/middleware: conecta método e caminho ao tratamento HTTP correspondente.
router.get('/api/rooms/:salaId/templates', authenticate, validate({ params: roomIdParamsSchema }), listRoomTemplates);
// Registro de rota/middleware: conecta método e caminho ao tratamento HTTP correspondente.
router.post('/api/rooms/:salaId/templates/:templateId', authenticate, validate({ params: roomTemplateParamsSchema }), addRoomTemplate);
// Registro de rota/middleware: conecta método e caminho ao tratamento HTTP correspondente.
router.delete('/api/rooms/:salaId/templates/:templateId', authenticate, validate({ params: roomTemplateParamsSchema }), removeRoomTemplate);
// Registro de rota/middleware: conecta método e caminho ao tratamento HTTP correspondente.
router.get('/api/sheet-templates/:id', authenticate, validate({ params: sheetIdParamsSchema }), getSheetTemplate);
// Registro de rota/middleware: conecta método e caminho ao tratamento HTTP correspondente.
router.get('/api/character-sheets/:id', authenticate, validate({ params: sheetIdParamsSchema }), getCharacterSheet);
// Registro de rota/middleware: conecta método e caminho ao tratamento HTTP correspondente.
router.post('/api/character-sheets', authenticate, validate({ body: createSheetSchema }), createCharacterSheet);
// Registro de rota/middleware: conecta método e caminho ao tratamento HTTP correspondente.
router.post('/api/character-sheets/:id/clone', authenticate, validate({ params: sheetIdParamsSchema }), cloneSheet);
// Registro de rota/middleware: conecta método e caminho ao tratamento HTTP correspondente.
router.put('/api/rooms/:salaId/tokens/:tokenId/sheet', authenticate, validate({ params: tokenSheetParamsSchema, body: linkSheetSchema }), linkSheetToToken);
// Registro de rota/middleware: conecta método e caminho ao tratamento HTTP correspondente.
router.put('/api/character-sheets/:id/values', authenticate, validate({ params: sheetIdParamsSchema, body: updateValuesSchema }), updateCharacterSheetValues);
// Registro de rota/middleware: conecta método e caminho ao tratamento HTTP correspondente.
router.get('/api/user/library', authenticate, getUserLibrary);
// Registro de rota/middleware: conecta método e caminho ao tratamento HTTP correspondente.
router.post('/api/rooms/:salaId/character-sheets/:id/import', authenticate, validate({ params: importSheetParamsSchema }), importCharacterSheet);

export default router;
