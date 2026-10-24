import { randomUUID } from 'node:crypto';
import express from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { db } from './db.js';
import { authRouter } from './modules/auth/router.js';
import { ApiError, errorHandler } from './shared/errors.js';
import { csrfGuard } from './shared/security.js';
export const app = express();
app.disable('x-powered-by');
app.use(helmet());
app.use((_req, res, next) => { res.locals.requestId = randomUUID(); res.setHeader('X-Request-Id', res.locals.requestId); res.setHeader('Cache-Control', 'no-store'); next(); });
app.use(express.json({ limit: '32kb' }), cookieParser(), csrfGuard);
app.get('/api/health', async (_req, res) => {
  try { await db.$queryRaw`SELECT 1`; res.json({ data: { status: 'ok', database: 'up' } }); }
  catch { throw new ApiError(503, 'DATABASE_UNAVAILABLE', 'Database unavailable'); }
});
app.use('/api/auth', authRouter);
app.use((_req, _res, next) => next(new ApiError(404, 'NOT_FOUND', 'Endpoint not found')));
app.use(errorHandler);
