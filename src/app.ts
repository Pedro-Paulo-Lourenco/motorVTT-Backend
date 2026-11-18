/** Configura a aplicação Express sem iniciar o servidor de rede. */
// Importações: reúnem bibliotecas, tipos e módulos locais usados pelos blocos seguintes.
import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';

import { env } from './config/env.js';
import { errorHandler, correlationId, notFound } from './http/middlewares.js';
import router from './routes/index.js';

// Constante ou estado local: `app` mantém o dado necessário ao fluxo abaixo.
const app = express();

// Composição da aplicação: define uma etapa do pipeline Express ou inicia o servidor.
app.use(correlationId);
// Composição da aplicação: define uma etapa do pipeline Express ou inicia o servidor.
app.use(cors({
    origin: env.CORS_ORIGIN,
    credentials: true,
}));
// Composição da aplicação: define uma etapa do pipeline Express ou inicia o servidor.
app.use(express.json());
// Composição da aplicação: define uma etapa do pipeline Express ou inicia o servidor.
app.use(cookieParser());
// Composição da aplicação: define uma etapa do pipeline Express ou inicia o servidor.
app.use(router);
// Composição da aplicação: define uma etapa do pipeline Express ou inicia o servidor.
app.use(notFound);
// Composição da aplicação: define uma etapa do pipeline Express ou inicia o servidor.
app.use(errorHandler);

export default app;
