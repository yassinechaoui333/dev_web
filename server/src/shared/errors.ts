import type { ErrorRequestHandler } from 'express';
import { Prisma } from '@prisma/client';
import { ZodError } from 'zod';
export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}
export const errorHandler: ErrorRequestHandler = (error, req, res, _next) => {
  let status = 500, code = 'INTERNAL_ERROR', message = 'An unexpected error occurred';
  let details: unknown;
  if (error instanceof ApiError) ({ status, code, message } = error);
  else if (error instanceof ZodError) { status = 400; code = 'VALIDATION_ERROR'; message = 'Invalid request'; details = error.issues.map(i => ({ path: i.path.join('.'), message: i.message })); }
  else if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') { status = 409; code = 'CONFLICT'; message = 'A record with these values already exists'; }
  else if (error instanceof SyntaxError && 'body' in error) { status = 400; code = 'INVALID_JSON'; message = 'Invalid JSON body'; }
  else if (error?.type === 'entity.too.large') { status = 413; code = 'PAYLOAD_TOO_LARGE'; message = 'Request body is too large'; }
  if (status === 500) console.error({ requestId: res.locals.requestId, error });
  res.status(status).json({ error: { code, message, ...(details ? { details } : {}), requestId: res.locals.requestId } });
};
