import type { AuthenticatedRequestUser } from '../http/types.js';

declare global {
    namespace Express {
        interface Request {
            user?: AuthenticatedRequestUser;
        }
    }
}

export {};
