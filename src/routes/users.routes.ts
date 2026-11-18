/** Declara endpoints de perfil e administração de usuários. */
// Dependências deste módulo: cada importação fornece recursos, tipos ou integrações usados na implementação abaixo.
import { Router } from 'express';

import { getUser } from '../controllers/users.controller.js';
import { validate } from '../http/validation.js';
import { userParamsSchema, userQuerySchema } from './users.schemas.js';

// Estado intermediário: `usersRouter` guarda o valor que será validado, transformado ou persistido nas etapas seguintes.
const usersRouter = Router();

usersRouter.get(
    '/:id',
    validate({ params: userParamsSchema, query: userQuerySchema }),
    getUser,
);

export default usersRouter;
