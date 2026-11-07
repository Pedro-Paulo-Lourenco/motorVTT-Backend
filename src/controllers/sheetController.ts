import type { Request, Response } from 'express';
import type { CharacterSheet, SheetTemplate } from '@motor-vtt/contracts';

import { HttpError } from '../http/errors.js';
import { sendSuccess } from '../http/response.js';
import type { ApiResponse, ValidatedLocals } from '../http/types.js';
import { sheetService } from '../services/sheetService.js';
import type { CreateSheetBody, CreateTemplateBody, UpdateTemplateBody, RoomTemplateParams, SheetIdParams, UpdateValuesBody, LinkSheetBody, TokenSheetParams } from '../routes/sheetSchemas.js';

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

export async function listSheetTemplates(req: Request, res: Response<ApiResponse<SheetTemplate[]>>): Promise<void> {
    if (!req.user) throw new HttpError(401, 'UNAUTHORIZED', 'Não autorizado.');
    sendSuccess(res, 200, await sheetService.listTemplates(req.user.id));
}

export async function updateSheetTemplate(req: Request, res: Response<ApiResponse<SheetTemplate>, ValidatedLocals<UpdateTemplateBody, undefined, SheetIdParams>>): Promise<void> {
    if (!req.user) throw new HttpError(401, 'UNAUTHORIZED', 'Não autorizado.');
    sendSuccess(res, 200, await sheetService.updateTemplate(res.locals.validated.params.id, req.user.id, res.locals.validated.body));
}

export async function deleteSheetTemplate(req: Request, res: Response<void, ValidatedLocals<undefined, undefined, SheetIdParams>>): Promise<void> {
    if (!req.user) throw new HttpError(401, 'UNAUTHORIZED', 'Não autorizado.');
    await sheetService.deleteTemplate(res.locals.validated.params.id, req.user.id);
    res.status(204).send();
}

export async function listRoomTemplates(req: Request, res: Response<ApiResponse<SheetTemplate[]>, ValidatedLocals<undefined, undefined, { salaId: string }>>): Promise<void> {
    if (!req.user) throw new HttpError(401, 'UNAUTHORIZED', 'Não autorizado.');
    sendSuccess(res, 200, await sheetService.listRoomTemplates(res.locals.validated.params.salaId, req.user.id));
}

export async function addRoomTemplate(req: Request, res: Response<void, ValidatedLocals<undefined, undefined, RoomTemplateParams>>): Promise<void> {
    if (!req.user) throw new HttpError(401, 'UNAUTHORIZED', 'Não autorizado.');
    await sheetService.addRoomTemplate(res.locals.validated.params.salaId, res.locals.validated.params.templateId, req.user.id);
    res.status(204).send();
}

export async function removeRoomTemplate(req: Request, res: Response<void, ValidatedLocals<undefined, undefined, RoomTemplateParams>>): Promise<void> {
    if (!req.user) throw new HttpError(401, 'UNAUTHORIZED', 'Não autorizado.');
    await sheetService.removeRoomTemplate(res.locals.validated.params.salaId, res.locals.validated.params.templateId, req.user.id);
    res.status(204).send();
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


export async function linkSheetToToken(
    req: Request,
    res: Response<void, ValidatedLocals<LinkSheetBody, undefined, TokenSheetParams>>,
): Promise<void> {
    if (!req.user) throw new HttpError(401, 'UNAUTHORIZED', 'Não autorizado.');
    const { salaId, tokenId } = res.locals.validated.params;
    await sheetService.linkSheetToToken(salaId, tokenId, res.locals.validated.body.sheetId, req.user.id);
    res.status(204).send();
}
