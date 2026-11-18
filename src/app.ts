/** Configura a aplicação Express sem iniciar o servidor de rede. */
// Dependências deste módulo: cada importação fornece recursos, tipos ou integrações usados na implementação abaixo.
import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';

import { env } from './config/env.js';
import { errorHandler, correlationId, notFound } from './http/middlewares.js';
import router from './routes/index.js';

// Estado intermediário: `app` guarda o valor que será validado, transformado ou persistido nas etapas seguintes.
const app = express();

// Composição da aplicação: registra esta etapa no pipeline Express para que as requisições sejam processadas na ordem esperada.
app.use(correlationId);
// Composição da aplicação: registra esta etapa no pipeline Express para que as requisições sejam processadas na ordem esperada.
app.use(cors({
    origin: env.CORS_ORIGIN,
    credentials: true,
}));
// Composição da aplicação: registra esta etapa no pipeline Express para que as requisições sejam processadas na ordem esperada.
app.use(express.json());
// Composição da aplicação: registra esta etapa no pipeline Express para que as requisições sejam processadas na ordem esperada.
app.use(cookieParser());
// Composição da aplicação: registra esta etapa no pipeline Express para que as requisições sejam processadas na ordem esperada.
app.use(router);
// Composição da aplicação: registra esta etapa no pipeline Express para que as requisições sejam processadas na ordem esperada.
app.use(notFound);
// Composição da aplicação: registra esta etapa no pipeline Express para que as requisições sejam processadas na ordem esperada.
app.use(errorHandler);

export default app;
