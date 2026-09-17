import { Router } from 'express';

import { getUser } from '../controllers/users.controller.js';
import { validate } from '../http/validation.js';
import { userParamsSchema, userQuerySchema } from './users.schemas.js';

const usersRouter = Router();

usersRouter.get(
    '/:id',
    validate({ params: userParamsSchema, query: userQuerySchema }),
    getUser,
);

export default usersRouter;
