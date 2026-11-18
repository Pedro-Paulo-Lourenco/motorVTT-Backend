/** Compõe os roteadores HTTP em uma única árvore da aplicação. */
// Importações: reúnem bibliotecas, tipos e módulos locais usados pelos blocos seguintes.
import { Router } from 'express';

import healthRouter from './health.routes.js';
import usersRouter from './users.routes.js';
import authRouter from './auth.routes.js';
import roomsRouter from './rooms.routes.js';
import sheetRouter from './sheetRoutes.js';

// Constante ou estado local: `router` mantém o dado necessário ao fluxo abaixo.
const router = Router();

// Registro de rota/middleware: conecta método e caminho ao tratamento HTTP correspondente.
router.use(healthRouter);
// Registro de rota/middleware: conecta método e caminho ao tratamento HTTP correspondente.
router.use('/api/users', usersRouter);
// Registro de rota/middleware: conecta método e caminho ao tratamento HTTP correspondente.
router.use('/api/auth', authRouter);
// Registro de rota/middleware: conecta método e caminho ao tratamento HTTP correspondente.
router.use('/api/rooms', roomsRouter);
// Registro de rota/middleware: conecta método e caminho ao tratamento HTTP correspondente.
router.use(sheetRouter);

export default router;
