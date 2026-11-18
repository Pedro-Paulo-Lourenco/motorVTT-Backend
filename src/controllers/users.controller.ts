/** Implementa a fronteira HTTP para consulta e alteração de usuários. */
// Importações: reúnem bibliotecas, tipos e módulos locais usados pelos blocos seguintes.
import type { Request, Response } from 'express';

import { sendSuccess } from '../http/response.js';
import type { ApiResponse, ValidatedLocals } from '../http/types.js';
import type { UserParams, UserQuery } from '../routes/users.schemas.js';

// Exportação principal: `getUser` disponibiliza esta responsabilidade para os consumidores deste módulo.
export function getUser(
    _req: Request,
    res: Response<ApiResponse<unknown>, ValidatedLocals<undefined, UserQuery, UserParams>>,
): void {
    const { id } = res.locals.validated.params;
    const { includeInactive } = res.locals.validated.query;

    sendSuccess(res, 200, { id, includeInactive });
}
