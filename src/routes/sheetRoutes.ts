import { Router } from 'express';
import { validate } from '../http/validation.js';
import { authenticate } from '../middlewares/authenticate.js';
import { createCharacterSheet, createSheetTemplate, listSheetTemplates, updateSheetTemplate, deleteSheetTemplate, listRoomTemplates, addRoomTemplate, removeRoomTemplate, getCharacterSheet, getSheetTemplate, updateCharacterSheetValues, linkSheetToToken, getUserLibrary, cloneSheet, cloneTemplate, importCharacterSheet } from '../controllers/sheetController.js';
import { createSheetSchema, createTemplateSchema, updateTemplateSchema, sheetIdParamsSchema, roomIdParamsSchema, roomTemplateParamsSchema, updateValuesSchema, linkSheetSchema, tokenSheetParamsSchema, importSheetParamsSchema } from './sheetSchemas.js';

const router = Router();
router.get('/api/sheet-templates', authenticate, listSheetTemplates);
router.post('/api/sheet-templates', authenticate, validate({ body: createTemplateSchema }), createSheetTemplate);
router.post('/api/sheet-templates/:id/clone', authenticate, validate({ params: sheetIdParamsSchema }), cloneTemplate);
router.put('/api/sheet-templates/:id', authenticate, validate({ params: sheetIdParamsSchema, body: updateTemplateSchema }), updateSheetTemplate);
router.delete('/api/sheet-templates/:id', authenticate, validate({ params: sheetIdParamsSchema }), deleteSheetTemplate);
router.get('/api/rooms/:salaId/templates', authenticate, validate({ params: roomIdParamsSchema }), listRoomTemplates);
router.post('/api/rooms/:salaId/templates/:templateId', authenticate, validate({ params: roomTemplateParamsSchema }), addRoomTemplate);
router.delete('/api/rooms/:salaId/templates/:templateId', authenticate, validate({ params: roomTemplateParamsSchema }), removeRoomTemplate);
router.get('/api/sheet-templates/:id', authenticate, validate({ params: sheetIdParamsSchema }), getSheetTemplate);
router.get('/api/character-sheets/:id', authenticate, validate({ params: sheetIdParamsSchema }), getCharacterSheet);
router.post('/api/character-sheets', authenticate, validate({ body: createSheetSchema }), createCharacterSheet);
router.post('/api/character-sheets/:id/clone', authenticate, validate({ params: sheetIdParamsSchema }), cloneSheet);
router.put('/api/rooms/:salaId/tokens/:tokenId/sheet', authenticate, validate({ params: tokenSheetParamsSchema, body: linkSheetSchema }), linkSheetToToken);
router.put('/api/character-sheets/:id/values', authenticate, validate({ params: sheetIdParamsSchema, body: updateValuesSchema }), updateCharacterSheetValues);
router.get('/api/user/library', authenticate, getUserLibrary);
router.post('/api/rooms/:salaId/character-sheets/:id/import', authenticate, validate({ params: importSheetParamsSchema }), importCharacterSheet);

export default router;
