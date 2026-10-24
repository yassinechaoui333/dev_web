import { createHash } from 'node:crypto';
import '../src/config.js';
import { db } from '../src/db.js';
import { hashPassword } from '../src/shared/security.js';
async function seed() {
  if (process.env.NODE_ENV === 'production') throw new Error('Development seed disabled in production');
  const adminPassword = process.env.SEED_ADMIN_PASSWORD;
  const userPassword = process.env.SEED_USER_PASSWORD;
  if (!adminPassword || !userPassword || Math.min(adminPassword.length, userPassword.length) < 12) throw new Error('Set seed passwords of at least 12 characters in .env');
  // Reruns preserve account changes and never reset passwords or privileges.
  const admin = await db.user.upsert({ where: { email: 'yassine@example.test' }, update: {}, create: { email: 'yassine@example.test', name: 'Yassine Demo', role: 'ADMIN', passwordHash: await hashPassword(adminPassword) } });
  const member = await db.user.upsert({ where: { email: 'member@example.test' }, update: {}, create: { email: 'member@example.test', name: 'Demo Analyst', passwordHash: await hashPassword(userPassword) } });
  const datasetId = '10000000-0000-4000-8000-000000000001';
  await db.$transaction(async tx => {
    if (await tx.dataset.findUnique({ where: { id: datasetId } })) return;
    await tx.dataset.create({ data: { id: datasetId, ownerId: member.id, title: 'Fictional retail sample', description: 'Three fictional sales rows for integration', category: 'Retail', source: 'Development fixture', currency: 'GBP' } });
    const job = await tx.importJob.create({ data: { datasetId, filename: 'fictional-sales.csv', contentHash: createHash('sha256').update('fictional-sales-fixture-v1').digest('hex'), status: 'completed', totalRows: 3, processedRows: 3, acceptedRows: 3, completedAt: new Date() } });
    for (const [i, row] of [
      { invoiceNumber: 'INV-001', productCode: '001', description: 'Ceramic mug', quantity: '4', unitPrice: '5.2500', country: 'United Kingdom', customerId: '00042', invoiceDate: '2026-01-10T10:00:00Z', isCancellation: false },
      { invoiceNumber: 'INV-002', productCode: '002', description: 'Desk notebook', quantity: '2', unitPrice: '8.5000', country: 'France', customerId: null, invoiceDate: '2026-01-11T12:00:00Z', isCancellation: false },
      { invoiceNumber: 'C-003', productCode: '001', description: 'Ceramic mug return', quantity: '-1', unitPrice: '5.2500', country: 'United Kingdom', customerId: '00042', invoiceDate: '2026-01-12T09:00:00Z', isCancellation: true },
    ].entries()) {
      const raw = await tx.rawRecord.create({ data: { datasetId, importJobId: job.id, sourceRow: i + 2, values: Object.fromEntries(Object.entries(row).map(([key, value]) => [key, value === null ? "" : String(value)])) } });
      await tx.salesRecord.create({ data: { ...row, invoiceDate: new Date(row.invoiceDate), datasetId, importJobId: job.id, rawRecordId: raw.id } });
    }
    await tx.activity.create({ data: { actorId: admin.id, action: 'development.seed', entityType: 'dataset', entityId: datasetId } });
  });
  console.log('Development seed ready (fictional data only).');
}
seed().finally(() => db.$disconnect());
