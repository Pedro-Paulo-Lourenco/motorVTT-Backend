/** Declara as rotas públicas e protegidas do ciclo de autenticação. */
// Importações: reúnem bibliotecas, tipos e módulos locais usados pelos blocos seguintes.
import { Router } from 'express';

import { login, logout, me, refresh, register } from '../controllers/auth.controller.js';
import { validate } from '../http/validation.js';
import { authenticate } from '../middlewares/authenticate.js';
import { loginSchema, registerSchema } from './auth.schemas.js';

// Constante ou estado local: `authRouter` mantém o dado necessário ao fluxo abaixo.
const authRouter = Router();

authRouter.post('/register', validate({ body: registerSchema }), register);
authRouter.post('/login', validate({ body: loginSchema }), login);
authRouter.post('/refresh', refresh);
authRouter.post('/logout', logout);
authRouter.get('/me', authenticate, me);

export default authRouter;
