/** Formato único de error de toda la API. Ver specs/02-design.md §4. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

export const badRequest = (code: string, msg: string, d?: Record<string, unknown>) => new ApiError(400, code, msg, d);
export const unauthorized = (msg = 'Necesitás iniciar sesión') => new ApiError(401, 'UNAUTHORIZED', msg);
export const forbidden = (msg = 'No tenés permiso para esto') => new ApiError(403, 'FORBIDDEN', msg);
export const notFound = (msg = 'No encontrado') => new ApiError(404, 'NOT_FOUND', msg);
export const conflict = (code: string, msg: string, d?: Record<string, unknown>) => new ApiError(409, code, msg, d);
