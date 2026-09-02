import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { requireAuth } from './middleware/auth.js';
import { meRouter } from './routes/me.js';
import { gamesRouter } from './routes/games.js';
import { groupsRouter } from './routes/groups.js';
import { entriesRouter } from './routes/entries.js';
import { entriesImportRouter } from './routes/entriesImport.js';
import { leaderboardRouter } from './routes/leaderboard.js';
import { dayRouter } from './routes/day.js';
import { blackoutsRouter } from './routes/blackouts.js';
import { h2hRouter } from './routes/h2h.js';
import { seasonsRouter } from './routes/seasons.js';
import { cronRouter } from './routes/cron.js';

export function createApp() {
  const app = express();
  const origins = (process.env['ALLOWED_ORIGINS'] ?? 'http://localhost:5173').split(',').map((o) => o.trim());

  app.use(helmet());
  app.use(cors({ origin: origins, credentials: true }));
  app.use(express.json({ limit: '64kb' }));

  app.get('/health', (_req, res) => {
    res.json({ ok: true, service: 'liga-de-juegos-api', now: new Date().toISOString() });
  });

  // Fuera del stack de JWT: quien llama es un cron externo, no un usuario logueado (T7.2).
  app.use(cronRouter);

  app.use(
    '/api/v1',
    requireAuth,
    meRouter,
    gamesRouter,
    groupsRouter,
    entriesImportRouter,
    entriesRouter,
    leaderboardRouter,
    dayRouter,
    blackoutsRouter,
    h2hRouter,
    seasonsRouter,
  );

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
