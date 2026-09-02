import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from './app.js';

describe('API', () => {
  it('responde /health', async () => {
    const res = await request(createApp()).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it('usa el formato único de error en 404', async () => {
    const res = await request(createApp()).get('/no-existe');
    expect(res.status).toBe(404);
    expect(res.body.error).toMatchObject({ code: 'NOT_FOUND' });
    expect(res.body.error.message).toContain('/no-existe');
  });

  describe('T7.2 — POST /internal/cron/close-seasons, fuera del stack de JWT', () => {
    it('rechaza sin x-cron-secret', async () => {
      const res = await request(createApp()).post('/internal/cron/close-seasons');
      expect(res.status).toBe(401);
    });

    it('rechaza con un x-cron-secret que no coincide', async () => {
      process.env['CRON_SECRET'] = 'el-secreto-de-verdad';
      const res = await request(createApp()).post('/internal/cron/close-seasons').set('x-cron-secret', 'cualquier-otra-cosa');
      expect(res.status).toBe(401);
      delete process.env['CRON_SECRET'];
    });
  });
});
