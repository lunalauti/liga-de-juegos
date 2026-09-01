import { z } from 'zod';

/**
 * Cliente del único endpoint útil de la API de La Nación (Agilmente).
 * Ver specs/02-design.md §9. Sin auth, CORS abierto, resultado inmutable por id.
 */
export class LnFetchError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
  }
}

const API_BASE = 'https://lanacion-api.agilmenteapp.com/api/games/shared/';
const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

const lnResultSchema = z.object({
  id: z.string().uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  game: z.string(),
  level: z.string(),
  seconds: z.number().int().positive(),
  result: z.enum(['SUCCESS', 'FAIL']),
  user_id: z.string(),
  customer: z.string(),
});

export type LnResult = z.infer<typeof lnResultSchema>;

export function extractLnId(input: string): string {
  const match = UUID_RE.exec(input);
  if (!match) throw new LnFetchError('INVALID_LINK', 'Ese no parece un link de resultado de La Nación');
  return match[0].toLowerCase();
}

// Cache en memoria: el resultado de un id ya jugado no cambia (specs/02-design.md §9.1).
const cache = new Map<string, { data: LnResult; expiresAt: number }>();
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

async function fetchOnce(id: string): Promise<Response> {
  return fetch(API_BASE + id, {
    headers: {
      Accept: 'application/json, text/plain, */*',
      Origin: 'https://lanacion.agilmenteapp.com',
      Referer: 'https://lanacion.agilmenteapp.com/',
      'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36',
    },
    signal: AbortSignal.timeout(8000),
  });
}

/** Trae y valida un resultado. Timeout 8s + 1 reintento (specs/02-design.md §9.4). */
export async function fetchLnResult(idOrUrl: string): Promise<LnResult> {
  const id = extractLnId(idOrUrl);

  const cached = cache.get(id);
  if (cached && cached.expiresAt > Date.now()) return cached.data;

  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetchOnce(id);
      if (!res.ok) throw new LnFetchError('LN_UNAVAILABLE', 'La Nación no respondió. Probá de nuevo en un rato.');
      const raw = await res.json();
      const parsed = lnResultSchema.safeParse(raw);
      if (!parsed.success) throw new LnFetchError('LN_BAD_RESPONSE', 'No entendimos la respuesta de La Nación');
      cache.set(id, { data: parsed.data, expiresAt: Date.now() + CACHE_TTL_MS });
      return parsed.data;
    } catch (e) {
      lastError = e;
      if (e instanceof LnFetchError) throw e; // no reintentar errores de datos, sólo de red
    }
  }
  throw lastError instanceof Error
    ? new LnFetchError('LN_UNAVAILABLE', 'La Nación no respondió. Probá de nuevo en un rato.')
    : new LnFetchError('LN_UNAVAILABLE', 'La Nación no respondió.');
}
