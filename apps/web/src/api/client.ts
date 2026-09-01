export class ApiClientError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) {
    super(message);
  }
}

const BASE = import.meta.env.VITE_API_URL;

/** Cliente HTTP tipado mínimo. TanStack Query se suma en la Fase 4 (specs/02-design.md §2). */
export async function apiFetch<T>(
  path: string,
  opts: { method?: string; body?: unknown; accessToken?: string } = {},
): Promise<T> {
  const res = await fetch(`${BASE}/api/v1${path}`, {
    method: opts.method ?? 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(opts.accessToken ? { Authorization: `Bearer ${opts.accessToken}` } : {}),
    },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });

  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const err = json?.error;
    throw new ApiClientError(res.status, err?.code ?? 'UNKNOWN', err?.message ?? 'Algo salió mal');
  }
  return json as T;
}
