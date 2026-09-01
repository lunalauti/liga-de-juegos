import type { RequestHandler } from 'express';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { unauthorized } from '../errors.js';

/**
 * Valida el JWT que emite Supabase Auth contra su JWKS público e inyecta req.user.
 * Ver specs/02-design.md §1 — flujo de autenticación.
 *
 * Este proyecto usa las signing keys asimétricas nuevas de Supabase (ES256), no el
 * secreto compartido legacy: por eso se valida contra el JWKS y no con SUPABASE_JWT_SECRET.
 */
let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;

function getJwks() {
  if (jwks) return jwks;
  const supabaseUrl = process.env['SUPABASE_URL'];
  if (!supabaseUrl) throw new Error('SUPABASE_URL no configurado');
  jwks = createRemoteJWKSet(new URL('/auth/v1/.well-known/jwks.json', supabaseUrl));
  return jwks;
}

export const requireAuth: RequestHandler = async (req, _res, next) => {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return next(unauthorized());

  try {
    const token = header.slice('Bearer '.length);
    const { payload } = await jwtVerify(token, getJwks());
    if (typeof payload.sub !== 'string') throw new Error('token sin sub');
    req.user = { id: payload.sub, email: typeof payload['email'] === 'string' ? payload['email'] : undefined };
    next();
  } catch {
    next(unauthorized('Tu sesión venció. Iniciá sesión de nuevo.'));
  }
};
