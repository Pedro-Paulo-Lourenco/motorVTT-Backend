import { Router } from 'express';

import { sendSuccess } from '../http/response.js';

const healthRouter = Router();

healthRouter.get('/health', (_req, res) => {
    sendSuccess(res, 200, { status: 'ok', service: 'backend' });
});

export default healthRouter;
