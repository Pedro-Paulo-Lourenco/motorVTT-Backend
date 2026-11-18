/** Expõe o endpoint público de disponibilidade do processo. */
// Importações: reúnem bibliotecas, tipos e módulos locais usados pelos blocos seguintes.
import { Router } from 'express';

import { sendSuccess } from '../http/response.js';

// Constante ou estado local: `healthRouter` mantém o dado necessário ao fluxo abaixo.
const healthRouter = Router();

healthRouter.get('/health', (_req, res) => {
    sendSuccess(res, 200, { status: 'ok', service: 'backend' });
});

export default healthRouter;
