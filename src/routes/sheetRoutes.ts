import { Router } from 'express';
import { validate } from '../http/validation.js';
import { authenticate } from '../middlewares/authenticate.js';
import { createCharacterSheet, createSheetTemplate, getCharacterSheet, getSheetTemplate, updateCharacterSheetValues } from '../controllers/sheetController.js';
import { createSheetSchema, createTemplateSchema, sheetIdParamsSchema, updateValuesSchema } from './sheetSchemas.js';

const router = Router();
router.post('/api/sheet-templates', authenticate, validate({ body: createTemplateSchema }), createSheetTemplate);
router.get('/api/sheet-templates/:id', authenticate, validate({ params: sheetIdParamsSchema }), getSheetTemplate);
router.get('/api/character-sheets/:id', authenticate, validate({ params: sheetIdParamsSchema }), getCharacterSheet);
router.post('/api/character-sheets', authenticate, validate({ body: createSheetSchema }), createCharacterSheet);
router.put('/api/character-sheets/:id/values', authenticate, validate({ params: sheetIdParamsSchema, body: updateValuesSchema }), updateCharacterSheetValues);

export default router;
