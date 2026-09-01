import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError } from 'zod';
import { ApiError } from '../errors.js';

export const notFoundHandler: RequestHandler = (req, res) => {
  res.status(404).json({
    error: { code: 'NOT_FOUND', message: `No existe ${req.method} ${req.path}`, details: {} },
  });
};

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof ApiError) {
    res.status(err.status).json({ error: { code: err.code, message: err.message, details: err.details } });
    return;
  }
  if (err instanceof ZodError) {
    res.status(400).json({
      error: { code: 'VALIDATION_ERROR', message: 'Los datos que mandaste no son válidos', details: { issues: err.issues } },
    });
    return;
  }
  console.error('[api] error no manejado', err);
  res.status(500).json({ error: { code: 'INTERNAL', message: 'Algo se rompió de nuestro lado', details: {} } });
};
