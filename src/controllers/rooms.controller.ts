import type { Request, Response } from 'express';
import type { ParticipantInput, RoomInput } from '@motor-vtt/contracts';

import { HttpError } from '../http/errors.js';
import { sendSuccess } from '../http/response.js';
import type { ApiResponse, ValidatedLocals } from '../http/types.js';
import { roomsService } from '../services/rooms.service.js';
import type { CreateRoomBody, JoinRoomBody, RoomIdParams } from '../routes/rooms.schemas.js';

export async function createRoom(
    req: Request,
    res: Response<ApiResponse<RoomInput>, ValidatedLocals<CreateRoomBody, undefined, undefined>>,
): Promise<void> {
    if (!req.user) throw new HttpError(401, 'UNAUTHORIZED', 'Não autorizado.');
    const room = await roomsService.createRoom(res.locals.validated.body.nome, req.user.id);
    sendSuccess(res, 201, room);
}

export async function listRooms(
    req: Request,
    res: Response<ApiResponse<RoomInput[]>>,
): Promise<void> {
    if (!req.user) throw new HttpError(401, 'UNAUTHORIZED', 'Não autorizado.');
    sendSuccess(res, 200, await roomsService.listRooms(req.user.id));
}

export async function joinRoom(
    req: Request,
    res: Response<ApiResponse<ParticipantInput>, ValidatedLocals<JoinRoomBody, undefined, undefined>>,
): Promise<void> {
    if (!req.user) throw new HttpError(401, 'UNAUTHORIZED', 'Não autorizado.');
    const participant = await roomsService.joinRoom(
        res.locals.validated.body.codigoConvite,
        req.user.id,
    );
    sendSuccess(res, 201, participant);
}

export async function getRoom(
    req: Request,
    res: Response<
        ApiResponse<{ sala: RoomInput; participantes: ParticipantInput[] }>,
        ValidatedLocals<undefined, undefined, RoomIdParams>
    >,
): Promise<void> {
    if (!req.user) throw new HttpError(401, 'UNAUTHORIZED', 'Não autorizado.');
    const { salaId } = res.locals.validated.params;
    sendSuccess(res, 200, await roomsService.getRoomForParticipant(salaId, req.user.id));
}
