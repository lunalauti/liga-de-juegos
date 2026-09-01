/**
 * Cache en memoria del ranking calculado (specs/02-design.md §5.4): TTL de 60 s,
 * invalidada al escribir un entry del grupo. Nada de Redis — a esta escala
 * (RNF-5) un Map alcanza y sobra, y desaparece solo si el proceso se reinicia.
 */
interface CacheEntry {
  value: unknown;
  expiresAt: number;
}

const TTL_MS = 60_000;
const cache = new Map<string, CacheEntry>();

export function getCached<T>(key: string): T | undefined {
  const hit = cache.get(key);
  if (!hit || hit.expiresAt < Date.now()) {
    if (hit) cache.delete(key);
    return undefined;
  }
  return hit.value as T;
}

export function setCached(key: string, value: unknown): void {
  cache.set(key, { value, expiresAt: Date.now() + TTL_MS });
}

/** Se llama después de cualquier escritura en `entries` de este grupo. */
export function invalidateGroupCache(groupId: string): void {
  for (const key of cache.keys()) {
    if (key.startsWith(`${groupId}:`)) cache.delete(key);
  }
}
