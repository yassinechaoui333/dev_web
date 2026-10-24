import type { Prisma } from '@prisma/client';
import { db } from '../db.js';
import { ApiError } from './errors.js';
import { publicUser } from './security.js';
// Serialize all account-security changes, including session issuance. The fixed
// advisory lock also protects last-admin checks across multiple API processes.
export function accountTransaction<T>(work: (tx: Prisma.TransactionClient) => Promise<T>) {
  return db.$transaction(async tx => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(730021)::text`;
    return work(tx);
  }, { maxWait: 10000, timeout: 15000 });
}
export async function assertLiveSession(tx: Prisma.TransactionClient, sessionId: string, admin = false) {
  const session = await tx.session.findUnique({ where: { id: sessionId }, include: { user: { select: publicUser } } });
  if (!session || session.expiresAt <= new Date() || !session.user.active) throw new ApiError(401, 'UNAUTHENTICATED', 'Please sign in again');
  if (admin && session.user.role !== 'ADMIN') throw new ApiError(403, 'FORBIDDEN', 'Administrator access required');
  return session.user;
}
