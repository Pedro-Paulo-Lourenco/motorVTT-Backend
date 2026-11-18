/** Implementa a fronteira HTTP para consulta e alteração de usuários. */
// Dependências deste módulo: cada importação fornece recursos, tipos ou integrações usados na implementação abaixo.
import type { Request, Response } from 'express';

import { sendSuccess } from '../http/response.js';
import type { ApiResponse, ValidatedLocals } from '../http/types.js';
import type { UserParams, UserQuery } from '../routes/users.schemas.js';

// API pública do módulo: `getUser` define a interface pública consumida pelos demais módulos.
export function getUser(
    _req: Request,
    res: Response<ApiResponse<unknown>, ValidatedLocals<undefined, UserQuery, UserParams>>,
): void {
    const { id } = res.locals.validated.params;
    const { includeInactive } = res.locals.validated.query;

    sendSuccess(res, 200, { id, includeInactive });
}
