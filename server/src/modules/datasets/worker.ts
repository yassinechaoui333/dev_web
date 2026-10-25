import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { db } from "../../db.js";
import { parseSalesCsv } from "./parser.js";
let busy = false;
export async function processImport(id: string) {
  try {
    await db.$transaction(
      async (tx) => {
        const [lock] = await tx.$queryRaw<
          { locked: boolean }[]
        >`SELECT pg_try_advisory_xact_lock(54000, hashtext(${id})) AS locked`;
        if (!lock.locked) return;
        const job = await tx.importJob.findUnique({
          where: { id },
          include: { dataset: true, source: true },
        });
        if (!job || !["pending", "processing"].includes(job.status)) return;
        if (!job.source) throw new Error("Fichier source introuvable");
        await db.importJob.updateMany({
          where: { id },
          data: { status: "processing", error: null },
        });
        const rows = parseSalesCsv(job.source.content, job.dataset);
        await tx.rawRecord.deleteMany({ where: { importJobId: id } });
        for (let start = 0; start < rows.length; start += 500) {
          const batch = rows
            .slice(start, start + 500)
            .map((row) => ({ ...row, id: randomUUID() }));
          await tx.rawRecord.createMany({
            data: batch.map((row) => ({
              id: row.id,
              datasetId: job.datasetId,
              importJobId: id,
              sourceRow: row.sourceRow,
              values: row.values,
              validationErrors: row.errors.length ? row.errors : Prisma.DbNull,
            })),
          });
          const clean = batch.filter((row) => row.errors.length === 0);
          if (clean.length)
            await tx.salesRecord.createMany({
              data: clean.map((row) => ({
                ...row.clean,
                rawRecordId: row.id,
                datasetId: job.datasetId,
                importJobId: id,
              })),
            });
        }
        const acceptedRows = rows.filter((r) => !r.errors.length).length;
        await tx.importJob.update({
          where: { id },
          data: {
            status: "completed",
            totalRows: rows.length,
            processedRows: rows.length,
            acceptedRows,
            rejectedRows: rows.length - acceptedRows,
            error: null,
            completedAt: new Date(),
          },
        });
        await tx.activity.create({
          data: {
            actorId: job.dataset.ownerId,
            action: "dataset.import_completed",
            entityType: "dataset",
            entityId: job.datasetId,
            metadata: {
              importJobId: id,
              acceptedRows,
              rejectedRows: rows.length - acceptedRows,
            },
          },
        });
      },
      { timeout: 120000, maxWait: 10000 },
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Échec du traitement";
    // Transaction rollback leaves no raw/clean rows published by this attempt.
    await db.importJob.updateMany({
      where: { id, status: { in: ["pending", "processing"] } },
      data: {
        status: "failed",
        error: message.startsWith("Invalid `")
          ? "Échec du traitement en base"
          : message.slice(0, 1000),
        totalRows: 0,
        processedRows: 0,
        acceptedRows: 0,
        rejectedRows: 0,
      },
    });
  }
}
export function startImportWorker() {
  let stopped = false;
  const tick = async () => {
    if (busy || stopped) return;
    busy = true;
    try {
      const jobs = await db.importJob.findMany({
        where: { status: { in: ["pending", "processing"] } },
        orderBy: { createdAt: "asc" },
        take: 5,
      });
      for (const job of jobs) await processImport(job.id);
    } catch (error) {
      console.error("Import worker:", error);
    } finally {
      busy = false;
    }
  };
  const timer = setInterval(() => void tick(), 1000);
  timer.unref();
  void tick();
  return () => {
    stopped = true;
    clearInterval(timer);
  };
}
