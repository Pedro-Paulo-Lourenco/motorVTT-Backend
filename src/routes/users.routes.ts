/** Declara endpoints de perfil e administração de usuários. */
// Importações: reúnem bibliotecas, tipos e módulos locais usados pelos blocos seguintes.
import { Router } from 'express';

import { getUser } from '../controllers/users.controller.js';
import { validate } from '../http/validation.js';
import { userParamsSchema, userQuerySchema } from './users.schemas.js';

// Constante ou estado local: `usersRouter` mantém o dado necessário ao fluxo abaixo.
const usersRouter = Router();

usersRouter.get(
    '/:id',
    validate({ params: userParamsSchema, query: userQuerySchema }),
    getUser,
);

export default usersRouter;
