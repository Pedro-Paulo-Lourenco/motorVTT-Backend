/** Expõe o endpoint público de disponibilidade do processo. */
// Dependências deste módulo: cada importação fornece recursos, tipos ou integrações usados na implementação abaixo.
import { Router } from 'express';

import { sendSuccess } from '../http/response.js';

// Estado intermediário: `healthRouter` guarda o valor que será validado, transformado ou persistido nas etapas seguintes.
const healthRouter = Router();

healthRouter.get('/health', (_req, res) => {
    sendSuccess(res, 200, { status: 'ok', service: 'backend' });
});

export default healthRouter;
