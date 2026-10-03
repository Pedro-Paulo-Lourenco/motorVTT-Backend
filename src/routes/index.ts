import { Router } from 'express';

import healthRouter from './health.routes.js';
import usersRouter from './users.routes.js';
import authRouter from './auth.routes.js';
import roomsRouter from './rooms.routes.js';

const router = Router();

router.use(healthRouter);
router.use('/api/users', usersRouter);
router.use('/api/auth', authRouter);
router.use('/api/rooms', roomsRouter);

export default router;
