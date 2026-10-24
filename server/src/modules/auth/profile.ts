import { Router } from 'express';
import { z } from 'zod';
import { rateLimit } from 'express-rate-limit';
import { config } from '../../config.js';
import { ApiError } from '../../shared/errors.js';
import { accountTransaction, assertLiveSession } from '../../shared/accounts.js';
import { authenticate, cookieOptions, hashPassword, publicUser, verifyPassword } from '../../shared/security.js';
import { email, name, password } from '../../shared/validation.js';
export const profileRouter = Router();
profileRouter.use(authenticate);
profileRouter.use(['/profile', '/password'], rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: 'draft-8', legacyHeaders: false, handler: (_req, _res, next) => next(new ApiError(429, 'RATE_LIMITED', 'Too many account changes; try again later')) }));
const profileInput = z.object({ name: name.optional(), email: email.optional(), currentPassword: z.string().min(1).max(128).optional() }).strict()
  .refine(v => v.name !== undefined || v.email !== undefined, { message: 'Provide name or email' });
profileRouter.patch('/profile', async (req, res) => {
  const input = profileInput.parse(req.body);
  const user = await accountTransaction(async tx => {
    const current = await assertLiveSession(tx, res.locals.sessionId);
    const emailChanged = input.email !== undefined && input.email !== current.email;
    if (emailChanged) {
      const credentials = await tx.user.findUniqueOrThrow({ where: { id: current.id } });
      if (!input.currentPassword || !await verifyPassword(input.currentPassword, credentials.passwordHash)) throw new ApiError(400, 'INVALID_PASSWORD', 'Current password is incorrect');
    }
    const updated = await tx.user.update({ where: { id: current.id }, data: { ...(input.name !== undefined ? { name: input.name } : {}), ...(input.email !== undefined ? { email: input.email } : {}) }, select: publicUser });
    if (emailChanged) await tx.session.deleteMany({ where: { userId: current.id, id: { not: res.locals.sessionId } } });
    await tx.activity.create({ data: { actorId: current.id, action: 'profile.update', entityType: 'user', entityId: current.id, metadata: { nameChanged: input.name !== undefined && input.name !== current.name, emailChanged } } });
    return updated;
  });
  res.json({ data: user });
});
profileRouter.patch('/password', async (req, res) => {
  const input = z.object({ currentPassword: z.string().min(1).max(128), newPassword: password }).strict().parse(req.body);
  if (input.currentPassword === input.newPassword) throw new ApiError(400, 'VALIDATION_ERROR', 'Choose a different new password');
  const newHash = await hashPassword(input.newPassword);
  await accountTransaction(async tx => {
    const current = await assertLiveSession(tx, res.locals.sessionId);
    const credentials = await tx.user.findUniqueOrThrow({ where: { id: current.id } });
    if (!await verifyPassword(input.currentPassword, credentials.passwordHash)) throw new ApiError(400, 'INVALID_PASSWORD', 'Current password is incorrect');
    await tx.user.update({ where: { id: current.id }, data: { passwordHash: newHash } });
    await tx.session.deleteMany({ where: { userId: current.id } });
    await tx.activity.create({ data: { actorId: current.id, action: 'profile.password_change', entityType: 'user', entityId: current.id } });
  });
  res.clearCookie(config.cookieName, cookieOptions).status(204).end();
});
