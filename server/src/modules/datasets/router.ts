import { createHash, randomUUID } from 'node:crypto';
import express, { Router, type RequestHandler } from 'express';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { db } from '../../db.js';
import { requireDatasetAccess } from '../../shared/access.js';
import { ApiError } from '../../shared/errors.js';
import { authenticate } from '../../shared/security.js';
import { pageMeta, pagination, uuid } from '../../shared/validation.js';
import { MAX_FILE_BYTES } from './csv.js';
import { readCsvUpload } from './multipart.js';
import { isValidTimezone } from './normalize.js';
import { hasSource, removeSource, saveSource } from './storage.js';
import { enqueueImport } from './worker.js';
// Ahmed: dataset metadata, CSV imports, raw records and rejection reports.
// Every route authenticates, validates UUIDs, then checks dataset ownership.
export const datasetsRouter = Router();

const metadata = {
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(5000),
  category: z.string().trim().max(100),
  source: z.string().trim().max(500),
};
const createInput = z.object({
  ...metadata,
  description: metadata.description.default(''), category: metadata.category.default(''), source: metadata.source.default(''),
  currency: z.enum(['GBP', 'EUR', 'USD', 'MAD']),
  dateFormat: z.enum(['ISO8601', 'DMY_HM']).default('ISO8601'),
  timezone: z.string().default('UTC').refine(isValidTimezone, 'Use an IANA timezone such as UTC or Europe/London'),
}).strict();
const updateInput = z.object(metadata).partial().strict();
const order = [{ createdAt: 'desc' as const }, { id: 'desc' as const }];

async function ownedDataset(params: Record<string, unknown>, userId: string) {
  return requireDatasetAccess(uuid.parse(params.datasetId), userId);
}
async function ownedJob(params: Record<string, unknown>, userId: string) {
  const dataset = await ownedDataset(params, userId);
  const job = await db.importJob.findFirst({ where: { id: uuid.parse(params.importJobId), datasetId: dataset.id } });
  if (!job) throw new ApiError(404, 'NOT_FOUND', 'Import not found');
  return job;
}

datasetsRouter.get('/', authenticate, async (req, res) => {
  const { page, pageSize } = pagination.parse(req.query);
  const where = { ownerId: res.locals.user.id };
  const [data, total] = await Promise.all([
    db.dataset.findMany({ where, orderBy: order, skip: (page - 1) * pageSize, take: pageSize }),
    db.dataset.count({ where }),
  ]);
  res.json({ data, meta: pageMeta(page, pageSize, total) });
});

datasetsRouter.post('/', authenticate, async (req, res) => {
  const input = createInput.parse(req.body);
  const userId = res.locals.user.id;
  const dataset = await db.$transaction(async tx => {
    const created = await tx.dataset.create({ data: { ...input, ownerId: userId } });
    await tx.activity.create({ data: { actorId: userId, action: 'dataset.create', entityType: 'dataset', entityId: created.id } });
    return created;
  });
  res.status(201).json({ data: dataset });
});

datasetsRouter.get('/:datasetId', authenticate, async (req, res) => {
  res.json({ data: await ownedDataset(req.params, res.locals.user.id) });
});

// Currency, date format and timezone are not editable, so they stay immutable after import.
datasetsRouter.patch('/:datasetId', authenticate, async (req, res) => {
  const dataset = await ownedDataset(req.params, res.locals.user.id);
  const input = updateInput.parse(req.body);
  const updated = await db.$transaction(async tx => {
    const saved = await tx.dataset.update({ where: { id: dataset.id }, data: input });
    await tx.activity.create({ data: { actorId: res.locals.user.id, action: 'dataset.update', entityType: 'dataset', entityId: dataset.id } });
    return saved;
  });
  res.json({ data: updated });
});

// Cascades import jobs, raw/clean records, dashboards and shares, then removes retained files.
datasetsRouter.delete('/:datasetId', authenticate, async (req, res) => {
  const userId = res.locals.user.id;
  const dataset = await ownedDataset(req.params, userId);
  const jobs = await db.$transaction(async tx => {
    const found = await tx.importJob.findMany({ where: { datasetId: dataset.id }, select: { id: true } });
    const deleted = await tx.dataset.deleteMany({ where: { id: dataset.id, ownerId: userId } });
    if (!deleted.count) throw new ApiError(404, 'NOT_FOUND', 'Dataset not found');
    await tx.activity.create({ data: { actorId: userId, action: 'dataset.delete', entityType: 'dataset', entityId: dataset.id } });
    return found;
  });
  await Promise.all(jobs.map(job => removeSource(job.id).catch(error => console.error({ importJobId: job.id, error }))));
  res.status(204).end();
});

// Ownership is checked before the (up to 10 MiB) body is read.
const rawUpload = express.raw({ type: 'multipart/form-data', limit: MAX_FILE_BYTES + 64 * 1024 });
const readUploadBody: RequestHandler = (req, res, next) => rawUpload(req, res, error => {
  if (error?.type === 'entity.too.large') return next(new ApiError(413, 'FILE_TOO_LARGE', 'CSV files are limited to 10 MiB'));
  next(error);
});
const requireOwnedDataset: RequestHandler = async (req, res, next) => {
  res.locals.dataset = await ownedDataset(req.params, res.locals.user.id);
  next();
};

datasetsRouter.post('/:datasetId/imports', authenticate, requireOwnedDataset, readUploadBody, async (req, res) => {
  const dataset = res.locals.dataset, userId = res.locals.user.id;
  const { filename, content } = readCsvUpload(req.body, req.get('content-type'));
  if (!content.length) throw new ApiError(400, 'EMPTY_FILE', 'The uploaded file is empty');
  if (content.length > MAX_FILE_BYTES) throw new ApiError(413, 'FILE_TOO_LARGE', 'CSV files are limited to 10 MiB');
  const contentHash = createHash('sha256').update(content).digest('hex');
  const findExisting = () => db.importJob.findUnique({ where: { datasetId_contentHash: { datasetId: dataset.id, contentHash } }, select: { id: true } });
  const duplicate = (existingId = 'unknown') => new ApiError(409, 'DUPLICATE_IMPORT', `This file was already uploaded to this dataset (import job ${existingId})`);
  const existing = await findExisting();
  if (existing) throw duplicate(existing.id);
  // Store the source durably before the pending job exists, so the worker can always read it.
  const jobId = randomUUID();
  await saveSource(jobId, content);
  let job;
  try {
    job = await db.$transaction(async tx => {
      const created = await tx.importJob.create({ data: { id: jobId, datasetId: dataset.id, filename, contentHash } });
      await tx.activity.create({ data: { actorId: userId, action: 'import.create', entityType: 'importJob', entityId: jobId, metadata: { datasetId: dataset.id } } });
      return created;
    });
  } catch (error) {
    await removeSource(jobId);
    // A concurrent upload of the same bytes won the unique(datasetId, contentHash) race.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw duplicate((await findExisting())?.id);
    throw error;
  }
  enqueueImport(job.id);
  res.status(202).json({ data: job });
});

datasetsRouter.get('/:datasetId/imports', authenticate, async (req, res) => {
  const dataset = await ownedDataset(req.params, res.locals.user.id);
  const { page, pageSize } = pagination.parse(req.query);
  const where = { datasetId: dataset.id };
  const [data, total] = await Promise.all([
    db.importJob.findMany({ where, orderBy: order, skip: (page - 1) * pageSize, take: pageSize }),
    db.importJob.count({ where }),
  ]);
  res.json({ data, meta: pageMeta(page, pageSize, total) });
});

datasetsRouter.get('/:datasetId/imports/:importJobId', authenticate, async (req, res) => {
  res.json({ data: await ownedJob(req.params, res.locals.user.id) });
});

// Rejected rows of a completed job, by source row. Other statuses have no published rows.
datasetsRouter.get('/:datasetId/imports/:importJobId/rejections', authenticate, async (req, res) => {
  const job = await ownedJob(req.params, res.locals.user.id);
  const { page, pageSize } = pagination.parse(req.query);
  const where = { importJobId: job.id, datasetId: job.datasetId, validationErrors: { not: Prisma.DbNull }, importJob: { status: 'completed' as const } };
  const [data, total] = await Promise.all([
    db.rawRecord.findMany({ where, orderBy: { sourceRow: 'asc' }, skip: (page - 1) * pageSize, take: pageSize }),
    db.rawRecord.count({ where }),
  ]);
  res.json({ data, meta: pageMeta(page, pageSize, total) });
});

// Same job ID and retained source; staging rows are cleared atomically with the reset.
datasetsRouter.post('/:datasetId/imports/:importJobId/retry', authenticate, async (req, res) => {
  const job = await ownedJob(req.params, res.locals.user.id);
  if (job.status !== 'failed') throw new ApiError(409, 'IMPORT_NOT_FAILED', 'Only failed imports can be retried');
  if (!(await hasSource(job.id))) throw new ApiError(409, 'SOURCE_UNAVAILABLE', 'The original file is no longer available; upload it to a new dataset');
  const updated = await db.$transaction(async tx => {
    const reset = await tx.importJob.updateMany({
      where: { id: job.id, status: 'failed' },
      data: { status: 'pending', retryCount: { increment: 1 }, error: null, totalRows: 0, processedRows: 0, acceptedRows: 0, rejectedRows: 0, completedAt: null },
    });
    if (!reset.count) throw new ApiError(409, 'IMPORT_NOT_FAILED', 'Only failed imports can be retried');
    await tx.salesRecord.deleteMany({ where: { importJobId: job.id } });
    await tx.rawRecord.deleteMany({ where: { importJobId: job.id } });
    await tx.activity.create({ data: { actorId: res.locals.user.id, action: 'import.retry', entityType: 'importJob', entityId: job.id, metadata: { datasetId: job.datasetId } } });
    return tx.importJob.findUniqueOrThrow({ where: { id: job.id } });
  });
  enqueueImport(job.id);
  res.status(202).json({ data: updated });
});

// Original records of completed imports, newest import first, then by source row.
datasetsRouter.get('/:datasetId/raw-records', authenticate, async (req, res) => {
  const dataset = await ownedDataset(req.params, res.locals.user.id);
  const { page, pageSize } = pagination.parse(req.query);
  const where = { datasetId: dataset.id, importJob: { status: 'completed' as const } };
  const [data, total] = await Promise.all([
    db.rawRecord.findMany({ where, orderBy: [{ importJob: { createdAt: 'desc' } }, { importJobId: 'desc' }, { sourceRow: 'asc' }], skip: (page - 1) * pageSize, take: pageSize }),
    db.rawRecord.count({ where }),
  ]);
  res.json({ data, meta: pageMeta(page, pageSize, total) });
});
