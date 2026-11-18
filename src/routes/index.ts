/** Compõe os roteadores HTTP em uma única árvore da aplicação. */
// Dependências deste módulo: cada importação fornece recursos, tipos ou integrações usados na implementação abaixo.
import { Router } from 'express';

import healthRouter from './health.routes.js';
import usersRouter from './users.routes.js';
import authRouter from './auth.routes.js';
import roomsRouter from './rooms.routes.js';
import sheetRouter from './sheetRoutes.js';

// Estado intermediário: `router` guarda o valor que será validado, transformado ou persistido nas etapas seguintes.
const router = Router();

// Integração HTTP: associa o método e o caminho ao middleware ou controller responsável pelo tratamento da requisição.
router.use(healthRouter);
// Integração HTTP: associa o método e o caminho ao middleware ou controller responsável pelo tratamento da requisição.
router.use('/api/users', usersRouter);
// Integração HTTP: associa o método e o caminho ao middleware ou controller responsável pelo tratamento da requisição.
router.use('/api/auth', authRouter);
// Integração HTTP: associa o método e o caminho ao middleware ou controller responsável pelo tratamento da requisição.
router.use('/api/rooms', roomsRouter);
// Integração HTTP: associa o método e o caminho ao middleware ou controller responsável pelo tratamento da requisição.
router.use(sheetRouter);

export default router;
