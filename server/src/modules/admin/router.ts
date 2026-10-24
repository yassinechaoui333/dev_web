import { Router } from 'express';
import { z } from 'zod';
import { db } from '../../db.js';
import { ApiError } from '../../shared/errors.js';
import { accountTransaction, assertLiveSession } from '../../shared/accounts.js';
import { authenticate, publicUser, requireAdmin } from '../../shared/security.js';
import { pagination, pageMeta, uuid } from '../../shared/validation.js';
export const adminRouter = Router();
adminRouter.use(authenticate, requireAdmin);
const orderBy = [{ createdAt: 'desc' as const }, { id: 'desc' as const }];
adminRouter.get('/summary', async (req, res) => {
  z.object({}).strict().parse(req.query);
  const [users, activeUsers, datasets, importJobs, salesRecords, activities] = await db.$transaction([
    db.user.count(), db.user.count({ where: { active: true } }), db.dataset.count(), db.importJob.count(), db.salesRecord.count(), db.activity.count(),
  ], { isolationLevel: 'RepeatableRead' });
  res.json({ data: { users, activeUsers, datasets, importJobs, salesRecords, activities } });
});
adminRouter.get('/users', async (req, res) => {
  const { page, pageSize } = pagination.parse(req.query);
  const [data, total] = await db.$transaction([
    db.user.findMany({ select: publicUser, orderBy, skip: (page - 1) * pageSize, take: pageSize }), db.user.count(),
  ], { isolationLevel: 'RepeatableRead' });
  res.json({ data, meta: pageMeta(page, pageSize, total) });
});
adminRouter.patch('/users/:userId', async (req, res) => {
  const userId = uuid.parse(req.params.userId);
  const input = z.object({ role: z.enum(['USER', 'ADMIN']).optional(), active: z.boolean().optional() }).strict()
    .refine(v => v.role !== undefined || v.active !== undefined, { message: 'Provide role or active status' }).parse(req.body);
  const user = await accountTransaction(async tx => {
    const actor = await assertLiveSession(tx, res.locals.sessionId, true);
    if (userId === actor.id) throw new ApiError(409, 'SELF_CHANGE_FORBIDDEN', 'Use your profile for personal changes; another administrator must change your role or status');
    const target = await tx.user.findUnique({ where: { id: userId }, select: publicUser });
    if (!target) throw new ApiError(404, 'NOT_FOUND', 'User not found');
    const updated = { ...target, ...input };
    if (target.active && target.role === 'ADMIN' && (!updated.active || updated.role !== 'ADMIN')) {
      if (await tx.user.count({ where: { active: true, role: 'ADMIN' } }) <= 1) throw new ApiError(409, 'LAST_ADMIN', 'At least one active administrator must remain');
    }
    const changed = updated.active !== target.active || updated.role !== target.role;
    if (!changed) return target;
    const result = await tx.user.update({ where: { id: userId }, data: input, select: publicUser });
    await tx.session.deleteMany({ where: { userId } });
    await tx.activity.create({ data: { actorId: actor.id, action: 'admin.user_update', entityType: 'user', entityId: userId, metadata: { before: { role: target.role, active: target.active }, after: { role: result.role, active: result.active } } } });
    return result;
  });
  res.json({ data: user });
});
adminRouter.get('/datasets', async (req, res) => {
  const { page, pageSize } = pagination.parse(req.query);
  const [data, total] = await db.$transaction([
    db.dataset.findMany({ orderBy, skip: (page - 1) * pageSize, take: pageSize, include: { owner: { select: { id: true, name: true, email: true } }, _count: { select: { importJobs: true, salesRecords: true } } } }), db.dataset.count(),
  ], { isolationLevel: 'RepeatableRead' });
  res.json({ data, meta: pageMeta(page, pageSize, total) });
});
adminRouter.get('/activities', async (req, res) => {
  const { page, pageSize } = pagination.parse(req.query);
  const [data, total] = await db.$transaction([
    db.activity.findMany({ orderBy, skip: (page - 1) * pageSize, take: pageSize, include: { actor: { select: { id: true, name: true, email: true } } } }), db.activity.count(),
  ], { isolationLevel: 'RepeatableRead' });
  res.json({ data, meta: pageMeta(page, pageSize, total) });
});
