import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import type { Request } from 'express';
import { tooManyRequests } from '../errors.js';

/**
 * Deuda técnica del plan original (Fase 5, specs/02-design.md §7/§9.6): nunca se
 * implementó rate limit por usuario. Con un grupo de amigos el riesgo es bajo,
 * pero es la pieza de seguridad operativa más floja que quedaba pendiente — un
 * token filtrado o un bug en el front no debería poder golpear la API ni el
 * servicio de La Nación sin límite.
 *
 * Se limita por usuario autenticado (`req.user.id`), no por IP: varios jugones
 * del mismo grupo comparten wifi de casa y no tiene sentido penalizarlos entre sí.
 * Corre DESPUÉS de `requireAuth` — si por algo llegara sin usuario (no debería,
 * requireAuth ya cortó antes), cae a la IP como fallback.
 */
// req.user siempre está seteado acá (este middleware corre después de
// requireAuth) — el fallback por IP es sólo para no romper si algún día se
// monta en una ruta sin auth. ipKeyGenerator normaliza IPv6 para que no se
// pueda evadir el límite pidiendo desde distintas direcciones de un mismo /64.
function keyByUser(req: Request): string {
  return req.user?.id ?? ipKeyGenerator(req.ip ?? 'anon');
}

/** Fábrica compartida — separada para poder probar el comportamiento con límites chicos sin esperar minutos reales. */
export function createUserRateLimit(opts: { windowMs: number; limit: number; message?: string }) {
  return rateLimit({
    windowMs: opts.windowMs,
    limit: opts.limit,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: keyByUser,
    handler: (_req, _res, next) => next(tooManyRequests(opts.message)),
  });
}

/** Límite general del resto de la API: generoso, sólo para frenar un loop roto o un bot. */
export const apiRateLimit = createUserRateLimit({ windowMs: 60_000, limit: 120 });

/**
 * Límite específico para la importación de links de La Nación (§9.6 "Uso
 * abusivo"): cada import pega contra un servicio de terceros que no es nuestro
 * y que puede bloquearnos por volumen. Alcanza y sobra para cargar 3 juegos por
 * día varias veces si alguien se equivoca de link.
 */
export const importRateLimit = createUserRateLimit({
  windowMs: 10 * 60_000,
  limit: 30,
  message: 'Muchos links en poco tiempo — esperá unos minutos y probá de nuevo',
});
