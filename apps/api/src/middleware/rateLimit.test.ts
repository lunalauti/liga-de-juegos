import { describe, it, expect } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createUserRateLimit } from './rateLimit.js';
import { errorHandler } from './errorHandler.js';

/**
 * Deuda técnica cerrada (specs/02-design.md §7/§9.6): nunca había rate limit
 * por usuario. Se prueba con un límite chico en vez de los reales (120/min,
 * 30/10min) para no depender de tiempo real ni de cientos de requests.
 */
function appWithLimit(limit: number) {
  const app = express();
  app.use((req, _res, next) => {
    req.user = { id: 'user-1' };
    next();
  });
  app.use(createUserRateLimit({ windowMs: 60_000, limit }));
  app.get('/ping', (_req, res) => res.json({ ok: true }));
  app.use(errorHandler);
  return app;
}

describe('createUserRateLimit', () => {
  it('deja pasar mientras no se supere el límite', async () => {
    const app = appWithLimit(3);
    for (let i = 0; i < 3; i++) {
      const res = await request(app).get('/ping');
      expect(res.status).toBe(200);
    }
  });

  it('corta con 429 y el formato único de error al superar el límite', async () => {
    const app = appWithLimit(2);
    await request(app).get('/ping');
    await request(app).get('/ping');
    const res = await request(app).get('/ping');
    expect(res.status).toBe(429);
    expect(res.body.error).toMatchObject({ code: 'RATE_LIMITED' });
  });

  it('cuenta por usuario, no globalmente — otro user_id no se ve afectado', async () => {
    const app = express();
    app.use((req, _res, next) => {
      req.user = { id: req.header('x-user') ?? 'anon' };
      next();
    });
    app.use(createUserRateLimit({ windowMs: 60_000, limit: 1 }));
    app.get('/ping', (_req, res) => res.json({ ok: true }));
    app.use(errorHandler);

    const first = await request(app).get('/ping').set('x-user', 'a');
    expect(first.status).toBe(200);
    const blocked = await request(app).get('/ping').set('x-user', 'a');
    expect(blocked.status).toBe(429);
    const otherUser = await request(app).get('/ping').set('x-user', 'b');
    expect(otherUser.status).toBe(200);
  });
});
