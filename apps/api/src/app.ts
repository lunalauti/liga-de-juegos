import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';

export function createApp() {
  const app = express();
  const origins = (process.env['ALLOWED_ORIGINS'] ?? 'http://localhost:5173').split(',').map((o) => o.trim());

  app.use(helmet());
  app.use(cors({ origin: origins, credentials: true }));
  app.use(express.json({ limit: '64kb' }));

  app.get('/health', (_req, res) => {
    res.json({ ok: true, service: 'liga-de-juegos-api', now: new Date().toISOString() });
  });

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
