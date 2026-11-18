/** Declara as rotas públicas e protegidas do ciclo de autenticação. */
// Dependências deste módulo: cada importação fornece recursos, tipos ou integrações usados na implementação abaixo.
import { Router } from 'express';

import { login, logout, me, refresh, register } from '../controllers/auth.controller.js';
import { validate } from '../http/validation.js';
import { authenticate } from '../middlewares/authenticate.js';
import { loginSchema, registerSchema } from './auth.schemas.js';

// Estado intermediário: `authRouter` guarda o valor que será validado, transformado ou persistido nas etapas seguintes.
const authRouter = Router();

authRouter.post('/register', validate({ body: registerSchema }), register);
authRouter.post('/login', validate({ body: loginSchema }), login);
authRouter.post('/refresh', refresh);
authRouter.post('/logout', logout);
authRouter.get('/me', authenticate, me);

export default authRouter;
