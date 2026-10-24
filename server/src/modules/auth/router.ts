import { Router } from 'express';
import { z } from 'zod';
import { rateLimit } from 'express-rate-limit';
import { db } from '../../db.js';
import { config } from '../../config.js';
import { ApiError } from '../../shared/errors.js';
import { authenticate, cookieOptions, hashPassword, createSession, setSessionCookie, publicUser, tokenHash, verifyPassword } from '../../shared/security.js';
import { accountTransaction } from '../../shared/accounts.js';
import { email, name, password } from '../../shared/validation.js';
export const authRouter = Router();
const limit = rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: 'draft-8', legacyHeaders: false, handler: (_req, _res, next) => next(new ApiError(429, 'RATE_LIMITED', 'Too many attempts; try again later')) });
authRouter.post('/register', limit, async (req, res) => {
  const input = z.object({ email, name, password }).strict().parse(req.body);
  const passwordHash = await hashPassword(input.password);
  const result = await accountTransaction(async tx => {
    const created = await tx.user.create({ data: { email: input.email, name: input.name, passwordHash }, select: publicUser });
    await tx.activity.create({ data: { actorId: created.id, action: 'auth.register', entityType: 'user', entityId: created.id } });
    const token = await createSession(tx, created.id, req.cookies[config.cookieName]);
    return { user: created, token };
  });
  setSessionCookie(result.token, res);
  res.status(201).json({ data: result.user });
});
authRouter.post('/login', limit, async (req, res) => {
  const input = z.object({ email, password: z.string().min(1).max(128) }).strict().parse(req.body);
  const user = await db.user.findUnique({ where: { email: input.email } });
  // Use the same expensive password derivation when the email is unknown.
  const valid = await verifyPassword(input.password, user?.passwordHash ?? ('0'.repeat(32) + ':' + '0'.repeat(128)));
  if (!user || !valid || !user.active) throw new ApiError(401, 'INVALID_CREDENTIALS', 'Invalid email or password');
  const result = await accountTransaction(async tx => {
    const current = await tx.user.findUnique({ where: { id: user.id } });
    if (!current || !current.active || current.passwordHash !== user.passwordHash) throw new ApiError(401, 'INVALID_CREDENTIALS', 'Invalid email or password');
    const token = await createSession(tx, current.id, req.cookies[config.cookieName]);
    await tx.activity.create({ data: { actorId: current.id, action: 'auth.login', entityType: 'user', entityId: current.id } });
    const { passwordHash: _secret, ...safe } = current;
    return { user: safe, token };
  });
  setSessionCookie(result.token, res);
  res.json({ data: result.user });
});
authRouter.post('/logout', async (req, res) => {
  const token = req.cookies[config.cookieName];
  if (typeof token === 'string') await db.session.deleteMany({ where: { tokenHash: tokenHash(token) } });
  res.clearCookie(config.cookieName, cookieOptions).status(204).end();
});
authRouter.get('/me', authenticate, (_req, res) => res.json({ data: res.locals.user }));
