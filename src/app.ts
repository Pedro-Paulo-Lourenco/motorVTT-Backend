import express from 'express';

import { errorHandler, correlationId, notFound } from './http/middlewares.js';
import router from './routes/index.js';

const app = express();

app.use(correlationId);
app.use(express.json());
app.use(router);
app.use(notFound);
app.use(errorHandler);

export default app;
