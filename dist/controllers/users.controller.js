import { sendSuccess } from '../http/response.js';
export function getUser(_req, res) {
    const { id } = res.locals.validated.params;
    const { includeInactive } = res.locals.validated.query;
    sendSuccess(res, 200, { id, includeInactive });
}
//# sourceMappingURL=users.controller.js.map