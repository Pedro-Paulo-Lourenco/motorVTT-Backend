import { Router } from 'express';

import healthRouter from './health.routes.js';
import usersRouter from './users.routes.js';

const router = Router();

router.use(healthRouter);
router.use('/api/users', usersRouter);

export default router;
