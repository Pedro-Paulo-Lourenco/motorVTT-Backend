import { HttpError } from '../http/errors.js';
import { sendSuccess } from '../http/response.js';
import { roomsService } from '../services/rooms.service.js';
export async function createRoom(req, res) {
    if (!req.user)
        throw new HttpError(401, 'UNAUTHORIZED', 'Não autorizado.');
    const room = await roomsService.createRoom(res.locals.validated.body.nome, req.user.id, res.locals.validated.body.templateId);
    sendSuccess(res, 201, room);
}
export async function listRooms(req, res) {
    if (!req.user)
        throw new HttpError(401, 'UNAUTHORIZED', 'Não autorizado.');
    sendSuccess(res, 200, await roomsService.listRooms(req.user.id));
}
export async function joinRoom(req, res) {
    if (!req.user)
        throw new HttpError(401, 'UNAUTHORIZED', 'Não autorizado.');
    const participant = await roomsService.joinRoom(res.locals.validated.body.codigoConvite, req.user.id);
    sendSuccess(res, 201, participant);
}
export async function getRoom(req, res) {
    if (!req.user)
        throw new HttpError(401, 'UNAUTHORIZED', 'Não autorizado.');
    const { salaId } = res.locals.validated.params;
    sendSuccess(res, 200, await roomsService.getRoomForParticipant(salaId, req.user.id));
}
//# sourceMappingURL=rooms.controller.js.map