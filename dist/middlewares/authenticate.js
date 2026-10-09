import { HttpError } from '../http/errors.js';
import { authService, verifyAccessToken } from '../services/auth.service.js';
function readAccessToken(header, cookie) {
    if (header !== undefined) {
        const match = /^Bearer\s+(.+)$/i.exec(header.trim());
        return match?.[1];
    }
    return typeof cookie === 'string' ? cookie : undefined;
}
export const authenticate = async (req, _res, next) => {
    const token = readAccessToken(req.header('authorization'), req.cookies?.access_token);
    const payload = token === undefined ? undefined : verifyAccessToken(token);
    if (!payload) {
        next(new HttpError(401, 'UNAUTHORIZED', 'Não autorizado.'));
        return;
    }
    try {
        const user = await authService.authenticatedUser(payload);
        if (!user) {
            next(new HttpError(401, 'UNAUTHORIZED', 'Não autorizado.'));
            return;
        }
        req.user = { id: payload.userId, sessionId: payload.sessionId };
        next();
    }
    catch (error) {
        next(error);
    }
};
//# sourceMappingURL=authenticate.js.map