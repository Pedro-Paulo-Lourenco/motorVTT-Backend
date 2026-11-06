import type { Request, Response } from 'express';
import type { CharacterSheet, SheetTemplate } from '@motor-vtt/contracts';

import { HttpError } from '../http/errors.js';
import { sendSuccess } from '../http/response.js';
import type { ApiResponse, ValidatedLocals } from '../http/types.js';
import { sheetService } from '../services/sheetService.js';
import type { CreateSheetBody, CreateTemplateBody, SheetIdParams, UpdateValuesBody } from '../routes/sheetSchemas.js';

export async function createSheetTemplate(
    req: Request,
    res: Response<ApiResponse<SheetTemplate>, ValidatedLocals<CreateTemplateBody, undefined, undefined>>,
): Promise<void> {
    if (!req.user) throw new HttpError(401, 'UNAUTHORIZED', 'Não autorizado.');
    const body = res.locals.validated.body;
    sendSuccess(res, 201, await sheetService.createTemplate({
        usuarioId: req.user.id,
        nome: body.nome,
        camposSchema: body.camposSchema,
        ...(body.sistema === undefined ? {} : { sistema: body.sistema }),
        ...(body.salaId === undefined ? {} : { salaId: body.salaId }),
    }));
}

export async function getSheetTemplate(
    _req: Request,
    res: Response<ApiResponse<SheetTemplate>, ValidatedLocals<undefined, undefined, SheetIdParams>>,
): Promise<void> {
    sendSuccess(res, 200, await sheetService.getTemplateById(res.locals.validated.params.id));
}

export async function getCharacterSheet(
    req: Request,
    res: Response<ApiResponse<CharacterSheet>, ValidatedLocals<undefined, undefined, SheetIdParams>>,
): Promise<void> {
    if (!req.user) throw new HttpError(401, 'UNAUTHORIZED', 'Não autorizado.');
    sendSuccess(res, 200, await sheetService.getCharacterSheetById(
        res.locals.validated.params.id,
        req.user.id,
    ));
}

export async function createCharacterSheet(
    req: Request,
    res: Response<ApiResponse<CharacterSheet>, ValidatedLocals<CreateSheetBody, undefined, undefined>>,
): Promise<void> {
    if (!req.user) throw new HttpError(401, 'UNAUTHORIZED', 'Não autorizado.');
    const body = res.locals.validated.body;
    sendSuccess(res, 201, await sheetService.createSheet({
        usuarioId: req.user.id,
        templateId: body.templateId,
        nome: body.nome,
        ...(body.salaId === undefined ? {} : { salaId: body.salaId }),
        ...(body.dadosPreenchidos === undefined ? {} : { dadosPreenchidos: body.dadosPreenchidos }),
    }));
}

export async function updateCharacterSheetValues(
    req: Request,
    res: Response<ApiResponse<CharacterSheet>, ValidatedLocals<UpdateValuesBody, undefined, SheetIdParams>>,
): Promise<void> {
    if (!req.user) throw new HttpError(401, 'UNAUTHORIZED', 'Não autorizado.');
    const { id } = res.locals.validated.params;
    sendSuccess(res, 200, await sheetService.updateSheetValues(id, req.user.id, res.locals.validated.body));
}
