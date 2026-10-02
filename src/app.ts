import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';

import { env } from './config/env.js';
import { errorHandler, correlationId, notFound } from './http/middlewares.js';
import router from './routes/index.js';

const app = express();

app.use(correlationId);
app.use(cors({
    origin: env.CORS_ORIGIN,
    credentials: true,
}));
app.use(express.json());
app.use(cookieParser());
app.use(router);
app.use(notFound);
app.use(errorHandler);

export default app;
