import { Router } from 'express';
import { validate } from '../http/validation.js';
import { authenticate } from '../middlewares/authenticate.js';
import { createCharacterSheet, createSheetTemplate, listSheetTemplates, updateSheetTemplate, deleteSheetTemplate, listRoomTemplates, addRoomTemplate, removeRoomTemplate, getCharacterSheet, getSheetTemplate, updateCharacterSheetValues, linkSheetToToken } from '../controllers/sheetController.js';
import { createSheetSchema, createTemplateSchema, updateTemplateSchema, sheetIdParamsSchema, roomIdParamsSchema, roomTemplateParamsSchema, updateValuesSchema, linkSheetSchema, tokenSheetParamsSchema } from './sheetSchemas.js';

const router = Router();
router.get('/api/sheet-templates', authenticate, listSheetTemplates);
router.post('/api/sheet-templates', authenticate, validate({ body: createTemplateSchema }), createSheetTemplate);
router.put('/api/sheet-templates/:id', authenticate, validate({ params: sheetIdParamsSchema, body: updateTemplateSchema }), updateSheetTemplate);
router.delete('/api/sheet-templates/:id', authenticate, validate({ params: sheetIdParamsSchema }), deleteSheetTemplate);
router.get('/api/rooms/:salaId/templates', authenticate, validate({ params: roomIdParamsSchema }), listRoomTemplates);
router.post('/api/rooms/:salaId/templates/:templateId', authenticate, validate({ params: roomTemplateParamsSchema }), addRoomTemplate);
router.delete('/api/rooms/:salaId/templates/:templateId', authenticate, validate({ params: roomTemplateParamsSchema }), removeRoomTemplate);
router.get('/api/sheet-templates/:id', authenticate, validate({ params: sheetIdParamsSchema }), getSheetTemplate);
router.get('/api/character-sheets/:id', authenticate, validate({ params: sheetIdParamsSchema }), getCharacterSheet);
router.post('/api/character-sheets', authenticate, validate({ body: createSheetSchema }), createCharacterSheet);
router.put('/api/rooms/:salaId/tokens/:tokenId/sheet', authenticate, validate({ params: tokenSheetParamsSchema, body: linkSheetSchema }), linkSheetToToken);
router.put('/api/character-sheets/:id/values', authenticate, validate({ params: sheetIdParamsSchema, body: updateValuesSchema }), updateCharacterSheetValues);

export default router;
