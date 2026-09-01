import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import * as jose from 'jose';
import { createApp } from '../app.js';

// Clave de prueba propia: no dependemos de la red para testear el middleware.
// La app apunta su JWKS a este servidor HTTP local en vez del real de Supabase.
let publicJwksServer: { url: string; close: () => void };
let privateKey: jose.KeyLike;

beforeAll(async () => {
  const { publicKey, privateKey: pk } = await jose.generateKeyPair('ES256');
  privateKey = pk;
  const jwk = await jose.exportJWK(publicKey);
  const jwks = { keys: [{ ...jwk, alg: 'ES256', use: 'sig', kid: 'test-kid' }] };

  const http = await import('node:http');
  const server = http.createServer((_req, res) => {
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify(jwks));
  });
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  publicJwksServer = { url: `http://127.0.0.1:${port}`, close: () => server.close() };

  process.env['SUPABASE_URL'] = publicJwksServer.url;
});

async function tokenFor(sub: string, overrides: Record<string, unknown> = {}) {
  return new jose.SignJWT({ email: 'lauti@example.com', ...overrides })
    .setProtectedHeader({ alg: 'ES256', kid: 'test-kid' })
    .setSubject(sub)
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(privateKey);
}

describe('requireAuth', () => {
  it('rechaza sin header Authorization', async () => {
    const res = await request(createApp()).get('/api/v1/me');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('rechaza un token con firma inválida', async () => {
    const otherKeys = await jose.generateKeyPair('ES256');
    const badToken = await new jose.SignJWT({})
      .setProtectedHeader({ alg: 'ES256', kid: 'test-kid' })
      .setSubject('user-1')
      .setExpirationTime('1h')
      .sign(otherKeys.privateKey);
    const res = await request(createApp()).get('/api/v1/me').set('Authorization', `Bearer ${badToken}`);
    expect(res.status).toBe(401);
  });

  it('rechaza un token vencido', async () => {
    const expired = await new jose.SignJWT({})
      .setProtectedHeader({ alg: 'ES256', kid: 'test-kid' })
      .setSubject('user-1')
      .setExpirationTime(Math.floor(Date.now() / 1000) - 10)
      .sign(privateKey);
    const res = await request(createApp()).get('/api/v1/me').set('Authorization', `Bearer ${expired}`);
    expect(res.status).toBe(401);
  });

  it('deja pasar un token válido (y falla más adelante por falta de DB en este test)', async () => {
    const res = await request(createApp()).get('/api/v1/me').set('Authorization', `Bearer ${await tokenFor('user-1')}`);
    // Sin DATABASE_URL en este entorno de test, la query de /me tira error de conexión:
    // lo que importa acá es que NO sea 401 — el middleware ya lo dejó pasar.
    expect(res.status).not.toBe(401);
  });
});
