import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import request from 'supertest';
import { app } from '../src/app.js';
import { db } from '../src/db.js';
import { config } from '../src/config.js';
import { importQueueIdle } from '../src/modules/datasets/worker.js';
import { hasSource, removeSource, saveSource } from '../src/modules/datasets/storage.js';
if (process.env.NODE_ENV === 'production') throw new Error('Tests cannot run in production');
const origin = { Origin: config.origin, 'X-Requested-With': 'SalesPlatform' };
const header = 'InvoiceNo,StockCode,Description,Quantity,InvoiceDate,UnitPrice,CustomerID,Country\n';
const fixture = await readFile(new URL('../src/modules/datasets/fixtures/sample-sales.csv', import.meta.url));
const emails: string[] = [];
after(async () => {
  await importQueueIdle();
  const users = { email: { in: emails } };
  const jobs = await db.importJob.findMany({ where: { dataset: { owner: users } }, select: { id: true } });
  await Promise.all(jobs.map(job => removeSource(job.id)));
  await db.dataset.deleteMany({ where: { owner: users } });
  await db.activity.deleteMany({ where: { actor: users } });
  await db.user.deleteMany({ where: users });
  await db.$disconnect();
});

async function member() {
  const email = 'test-' + randomUUID() + '@example.test'; emails.push(email);
  const agent = request.agent(app);
  await agent.post('/api/auth/register').set(origin).send({ email, name: 'Dataset Tester', password: 'TestPassword123!' }).expect(201);
  return agent;
}
async function createDataset(agent: ReturnType<typeof request.agent>, extra: object = {}) {
  const res = await agent.post('/api/datasets').set(origin).send({ title: 'Fixture sales', currency: 'GBP', ...extra }).expect(201);
  return res.body.data as { id: string };
}
const upload = (agent: ReturnType<typeof request.agent>, datasetId: string, content: string | Buffer, filename = 'sales.csv') =>
  agent.post(`/api/datasets/${datasetId}/imports`).set(origin).attach('file', Buffer.from(content), filename);
async function finished(agent: ReturnType<typeof request.agent>, datasetId: string, jobId: string) {
  await importQueueIdle();
  return (await agent.get(`/api/datasets/${datasetId}/imports/${jobId}`).expect(200)).body.data;
}

test('valid fixture import publishes normalized rows, keeps raw rows and reports rejections', async () => {
  const agent = await member();
  const dataset = await createDataset(agent, { description: 'Fictional', category: 'Retail', source: 'Fixture' });
  const accepted = await upload(agent, dataset.id, fixture).expect(202);
  assert.equal(accepted.body.data.status, 'pending');
  assert.equal(accepted.body.data.filename, 'sales.csv');
  assert.match(accepted.body.data.contentHash, /^[0-9a-f]{64}$/);
  const job = await finished(agent, dataset.id, accepted.body.data.id);
  assert.deepEqual({ status: job.status, totalRows: job.totalRows, processedRows: job.processedRows, acceptedRows: job.acceptedRows, rejectedRows: job.rejectedRows, error: job.error, retryCount: job.retryCount },
    { status: 'completed', totalRows: 12, processedRows: 12, acceptedRows: 7, rejectedRows: 5, error: null, retryCount: 0 });
  assert.ok(job.completedAt);
  assert.equal(await hasSource(job.id), false, 'completed jobs do not retain the source file');

  const sales = await db.salesRecord.findMany({ where: { importJobId: job.id }, include: { rawRecord: true }, orderBy: { rawRecord: { sourceRow: 'asc' } } });
  assert.deepEqual(sales.map(s => s.rawRecord.sourceRow), [2, 3, 4, 5, 6, 7, 13]);
  const bySourceRow = Object.fromEntries(sales.map(s => [s.rawRecord.sourceRow, s]));
  assert.equal(bySourceRow[2].productCode, '00123');
  assert.equal(bySourceRow[2].customerId, '00042');
  assert.equal(bySourceRow[3].description, 'Linen napkin, set of 4');
  assert.equal(bySourceRow[4].description, 'Notebook "A5"');
  assert.equal(bySourceRow[4].customerId, null);
  assert.equal(bySourceRow[4].invoiceDate.toISOString(), '2026-03-03T13:00:00.000Z');
  assert.equal(bySourceRow[5].isCancellation, true);
  assert.equal(bySourceRow[5].quantity.toString(), '-2');
  assert.equal(bySourceRow[6].isCancellation, false);
  assert.equal(bySourceRow[6].quantity.toString(), '-1');
  assert.equal(bySourceRow[6].invoiceDate.toISOString(), '2026-03-05T11:30:00.000Z');
  assert.equal(bySourceRow[7].description, 'Gift card\nwith handwritten note');
  assert.equal(bySourceRow[7].customerId, '00077');
  assert.equal(bySourceRow[7].unitPrice.toString(), '0');
  assert.equal(bySourceRow[13].invoiceNumber, bySourceRow[2].invoiceNumber, 'identical lines are both kept');
  const [{ net }] = await db.$queryRaw<{ net: string }[]>`SELECT SUM(quantity * "unitPrice")::text AS net FROM "SalesRecord" WHERE "importJobId" = ${job.id}::uuid`;
  assert.equal(Number(net).toFixed(2), '54.25');

  const rejections = (await agent.get(`/api/datasets/${dataset.id}/imports/${job.id}/rejections`).expect(200)).body;
  assert.equal(rejections.meta.total, 5);
  assert.deepEqual(rejections.data.map((r: { sourceRow: number; validationErrors: { field: string; code: string }[] }) => [r.sourceRow, r.validationErrors.map(e => e.field + ':' + e.code).join()]),
    [[8, 'Quantity:INVALID_NUMBER'], [9, 'InvoiceDate:INVALID_DATE'], [10, 'UnitPrice:NEGATIVE_PRICE'], [11, 'InvoiceNo:REQUIRED'], [12, 'Quantity:TOO_MANY_DECIMALS']]);
  assert.equal(rejections.data[0].values.Quantity, 'abc', 'original values are preserved');
  const raw = (await agent.get(`/api/datasets/${dataset.id}/raw-records?pageSize=100`).expect(200)).body;
  assert.equal(raw.meta.total, 12);
  assert.equal(raw.data.find((r: { sourceRow: number }) => r.sourceRow === 7).values.CustomerID, '  00077  ');

  const duplicate = await upload(agent, dataset.id, fixture, 'renamed.csv').expect(409);
  assert.equal(duplicate.body.error.code, 'DUPLICATE_IMPORT');
  assert.match(duplicate.body.error.message, new RegExp(job.id));
  const other = await createDataset(agent);
  await upload(agent, other.id, fixture).expect(202);
  const history = (await agent.get(`/api/datasets/${dataset.id}/imports`).expect(200)).body;
  assert.equal(history.meta.total, 1);
  const list = (await agent.get('/api/datasets').expect(200)).body;
  assert.deepEqual(list.data.map((d: { id: string }) => d.id), [other.id, dataset.id]);
  const patched = await agent.patch(`/api/datasets/${dataset.id}`).set(origin).send({ title: 'Renamed' }).expect(200);
  assert.equal(patched.body.data.title, 'Renamed');
  await agent.patch(`/api/datasets/${dataset.id}`).set(origin).send({ currency: 'EUR' }).expect(400);
});

test('malformed files fail without publishing rows; retry reuses the same job and never duplicates', async () => {
  const agent = await member();
  const dataset = await createDataset(agent);
  const broken = await upload(agent, dataset.id, header + 'INV-1,"unterminated,Mug,1,2026-01-01T00:00:00Z,1,,UK\n').expect(202);
  const failed = await finished(agent, dataset.id, broken.body.data.id);
  assert.equal(failed.status, 'failed');
  assert.match(failed.error, /Unterminated quoted field/);
  assert.equal(failed.acceptedRows + failed.rejectedRows + failed.processedRows, 0);
  assert.equal(await db.rawRecord.count({ where: { importJobId: failed.id } }), 0);
  assert.equal(await hasSource(failed.id), true, 'failed jobs retain the source for retry');
  const retried = await agent.post(`/api/datasets/${dataset.id}/imports/${failed.id}/retry`).set(origin).expect(202);
  assert.equal(retried.body.data.id, failed.id);
  assert.equal(retried.body.data.retryCount, 1);
  assert.equal((await finished(agent, dataset.id, failed.id)).status, 'failed');

  const headers = await upload(agent, dataset.id, 'InvoiceNo,StockCode\nA,B\n').expect(202);
  assert.match((await finished(agent, dataset.id, headers.body.data.id)).error, /Missing required column headers: Description/);

  // Simulate an interrupted attempt that left staging rows behind, then retry.
  const good = await upload(agent, dataset.id, fixture).expect(202);
  await finished(agent, dataset.id, good.body.data.id);
  await agent.post(`/api/datasets/${dataset.id}/imports/${good.body.data.id}/retry`).set(origin).expect(409);
  await db.importJob.update({ where: { id: good.body.data.id }, data: { status: 'failed', error: 'simulated crash' } });
  await saveSource(good.body.data.id, fixture);
  await agent.post(`/api/datasets/${dataset.id}/imports/${good.body.data.id}/retry`).set(origin).expect(202);
  const again = await finished(agent, dataset.id, good.body.data.id);
  assert.deepEqual([again.status, again.acceptedRows, again.retryCount], ['completed', 7, 1]);
  assert.equal(await db.salesRecord.count({ where: { importJobId: good.body.data.id } }), 7);
  assert.equal(await db.rawRecord.count({ where: { importJobId: good.body.data.id } }), 12);
});

test('dataset timezone and DMY_HM format are applied to local timestamps', async () => {
  const agent = await member();
  const dataset = await createDataset(agent, { dateFormat: 'DMY_HM', timezone: 'Europe/London' });
  const csv = header + 'A1,1,Mug,1,15/07/2026 09:05,1,,UK\nA2,1,Mug,1,29/03/2026 01:30,1,,UK\nA3,1,Mug,1,2026-07-15T09:05:00Z,1,,UK\n';
  const job = await finished(agent, dataset.id, (await upload(agent, dataset.id, csv).expect(202)).body.data.id);
  assert.deepEqual([job.acceptedRows, job.rejectedRows], [1, 2]);
  const sale = await db.salesRecord.findFirstOrThrow({ where: { importJobId: job.id } });
  assert.equal(sale.invoiceDate.toISOString(), '2026-07-15T08:05:00.000Z');
});

test('input validation and upload limits', async () => {
  const agent = await member();
  await agent.post('/api/datasets').set(origin).send({ title: 'X', currency: 'JPY' }).expect(400);
  await agent.post('/api/datasets').set(origin).send({ title: 'X', currency: 'GBP', ownerId: randomUUID() }).expect(400);
  await agent.post('/api/datasets').set(origin).send({ title: 'X', currency: 'GBP', timezone: 'Mars/Base' }).expect(400);
  await agent.post('/api/datasets').set(origin).send({ title: ' ', currency: 'GBP' }).expect(400);
  await agent.get('/api/datasets/not-a-uuid').expect(400);
  await agent.get('/api/datasets?pageSize=101').expect(400);
  const dataset = await createDataset(agent);
  assert.equal((await upload(agent, dataset.id, 'a', 'sales.xlsx').expect(400)).body.error.code, 'UNSUPPORTED_FILE');
  assert.equal((await upload(agent, dataset.id, '').expect(400)).body.error.code, 'EMPTY_FILE');
  await agent.post(`/api/datasets/${dataset.id}/imports`).set(origin).send({ file: 'x' }).expect(400);
  const tooLarge = await upload(agent, dataset.id, Buffer.alloc(10 * 1024 * 1024 + 1, 'a')).expect(413);
  assert.equal(tooLarge.body.error.code, 'FILE_TOO_LARGE');
});

test('other users, admins, anonymous and cross-origin requests cannot reach a dataset', async () => {
  const owner = await member(), intruder = await member();
  const dataset = await createDataset(owner);
  const job = (await upload(owner, dataset.id, fixture).expect(202)).body.data;
  await importQueueIdle();
  const base = `/api/datasets/${dataset.id}`;
  for (const path of [base, base + '/imports', `${base}/imports/${job.id}`, `${base}/imports/${job.id}/rejections`, base + '/raw-records']) {
    assert.equal((await intruder.get(path).expect(404)).body.error.code, 'NOT_FOUND');
    await request(app).get(path).expect(401);
  }
  await upload(intruder, dataset.id, header).expect(404);
  await intruder.post(`${base}/imports/${job.id}/retry`).set(origin).expect(404);
  await intruder.patch(base).set(origin).send({ title: 'Mine' }).expect(404);
  await intruder.delete(base).set(origin).expect(404);
  assert.equal((await intruder.get('/api/datasets').expect(200)).body.meta.total, 0);
  // Admin privileges do not grant dataset content access.
  if (process.env.SEED_ADMIN_PASSWORD) {
    const admin = request.agent(app);
    await admin.post('/api/auth/login').set(origin).send({ email: 'yassine@example.test', password: process.env.SEED_ADMIN_PASSWORD }).expect(200);
    await admin.get(base).expect(404);
    await admin.post('/api/auth/logout').set(origin).expect(204);
  }
  await owner.delete(base).expect(403);
  await owner.get(base).expect(200);
});

test('deleting a dataset removes jobs, raw and clean rows and retained files', async () => {
  const agent = await member();
  const dataset = await createDataset(agent);
  await finished(agent, dataset.id, (await upload(agent, dataset.id, fixture).expect(202)).body.data.id);
  const failed = await finished(agent, dataset.id, (await upload(agent, dataset.id, header + 'A,"x\n').expect(202)).body.data.id);
  assert.equal(await hasSource(failed.id), true);
  await agent.delete(`/api/datasets/${dataset.id}`).set(origin).expect(204);
  await agent.get(`/api/datasets/${dataset.id}`).expect(404);
  assert.equal(await db.importJob.count({ where: { datasetId: dataset.id } }), 0);
  assert.equal(await db.rawRecord.count({ where: { datasetId: dataset.id } }), 0);
  assert.equal(await db.salesRecord.count({ where: { datasetId: dataset.id } }), 0);
  assert.equal(await hasSource(failed.id), false);
});
