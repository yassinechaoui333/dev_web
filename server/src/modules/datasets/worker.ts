import { randomUUID } from 'node:crypto';
import { db } from '../../db.js';
import { CsvFileError, decodeCsv, parseCsv } from './csv.js';
import { validateRecord } from './normalize.js';
import { readSource, removeSource } from './storage.js';
// In-process import queue. Uploads return 202 once the job is pending and the
// source is stored; processing happens here, outside the request lifecycle.
// Jobs run one at a time; the status-guarded claim keeps a job from being
// processed twice. MVP assumption: one API process (see module README).
const queue: string[] = [];
let running: Promise<void> | null = null;
const CHUNK = 2000;

export function enqueueImport(jobId: string) {
  queue.push(jobId);
  running ??= drain().finally(() => { running = null; });
}
async function drain() {
  for (let jobId = queue.shift(); jobId; jobId = queue.shift()) {
    try { await processImport(jobId); }
    catch (error) { console.error({ importJobId: jobId, error }); }
  }
}
export async function importQueueIdle() { while (running) await running; }

// Called once at server start: jobs interrupted by a restart are processed again.
export async function recoverImportJobs() {
  await db.importJob.updateMany({ where: { status: 'processing' }, data: { status: 'pending' } });
  const pending = await db.importJob.findMany({ where: { status: 'pending' }, orderBy: { createdAt: 'asc' }, select: { id: true } });
  for (const job of pending) enqueueImport(job.id);
}

async function failJob(jobId: string, error: string) {
  await db.importJob.updateMany({ where: { id: jobId, status: 'processing' }, data: { status: 'failed', error, processedRows: 0, acceptedRows: 0, rejectedRows: 0, completedAt: null } });
}

export async function processImport(jobId: string) {
  const claimed = await db.importJob.updateMany({ where: { id: jobId, status: 'pending' }, data: { status: 'processing' } });
  if (!claimed.count) return;
  const job = await db.importJob.findUnique({ where: { id: jobId }, include: { dataset: { select: { dateFormat: true, timezone: true } } } });
  if (!job) return;
  let parsed: ReturnType<typeof parseCsv>;
  try { parsed = parseCsv(decodeCsv(await readSource(jobId))); }
  catch (error) {
    if (error instanceof CsvFileError) return failJob(jobId, error.message);
    console.error({ importJobId: jobId, error });
    return failJob(jobId, (error as NodeJS.ErrnoException).code === 'ENOENT' ? 'The original file is no longer available; upload it again' : 'The file could not be read');
  }
  const rows = parsed.records.map(record => ({ record, ...validateRecord(parsed.headers, record, job.dataset) }));
  const acceptedRows = rows.filter(row => row.sale).length;
  await db.importJob.updateMany({ where: { id: jobId, status: 'processing' }, data: { totalRows: rows.length } });
  try {
    // One transaction: raw rows, clean rows and counters become visible together
    // or not at all. Staging rows from an earlier attempt are removed first.
    await db.$transaction(async tx => {
      await tx.salesRecord.deleteMany({ where: { importJobId: jobId } });
      await tx.rawRecord.deleteMany({ where: { importJobId: jobId } });
      for (let start = 0; start < rows.length; start += CHUNK) {
        const chunk = rows.slice(start, start + CHUNK).map(row => ({ ...row, rawId: randomUUID() }));
        await tx.rawRecord.createMany({ data: chunk.map(row => ({
          id: row.rawId, datasetId: job.datasetId, importJobId: jobId, sourceRow: row.record.sourceRow, values: row.values,
          ...(row.errors.length ? { validationErrors: row.errors } : {}),
        })) });
        const sales = chunk.flatMap(row => row.sale ? [{ ...row.sale, id: randomUUID(), datasetId: job.datasetId, importJobId: jobId, rawRecordId: row.rawId }] : []);
        if (sales.length) await tx.salesRecord.createMany({ data: sales });
      }
      const done = await tx.importJob.updateMany({
        where: { id: jobId, status: 'processing' },
        data: { status: 'completed', totalRows: rows.length, processedRows: rows.length, acceptedRows, rejectedRows: rows.length - acceptedRows, error: null, completedAt: new Date() },
      });
      if (!done.count) throw new Error('Import job is no longer processing');
    }, { maxWait: 10_000, timeout: 300_000 });
  } catch (error) {
    console.error({ importJobId: jobId, error });
    return failJob(jobId, 'The import could not be saved; retry the import');
  }
  // Completed jobs no longer need the retained source.
  await removeSource(jobId).catch(error => console.error({ importJobId: jobId, error }));
}
