import { Prisma } from "@prisma/client";
import { Router } from "express";
import { createHash } from "node:crypto";
import multer from "multer";
import { DateTime, IANAZone } from "luxon";
import { z } from "zod";
import { db } from "../../db.js";
import { authenticate } from "../../shared/security.js";
import { requireDatasetAccess } from "../../shared/access.js";
import { ApiError } from "../../shared/errors.js";
import { pagination, pageMeta, uuid } from "../../shared/validation.js";
export const datasetRouter = Router();
datasetRouter.use(authenticate);
const metadata = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().max(5000),
  category: z.string().max(100),
  source: z.string().max(500),
});
const create = metadata
  .extend({
    description: metadata.shape.description.default(""),
    category: metadata.shape.category.default(""),
    source: metadata.shape.source.default(""),
    currency: z.enum(["GBP", "EUR", "USD", "MAD"]),
    dateFormat: z.enum(["ISO8601", "DMY_HM"]).default("ISO8601"),
    timezone: z
      .string()
      .refine(
        (v) => v === "UTC" || IANAZone.isValidZone(v),
        "Fuseau horaire invalide",
      )
      .default("UTC"),
  })
  .strict();
const orderBy = [{ createdAt: "desc" as const }, { id: "desc" as const }];
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 1, fields: 0 },
});
datasetRouter.get("/", async (req, res) => {
  const { page, pageSize } = pagination.parse(req.query),
    where = { ownerId: res.locals.user.id };
  const [data, total] = await db.$transaction([
    db.dataset.findMany({
      where,
      orderBy,
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    db.dataset.count({ where }),
  ]);
  res.json({ data, meta: pageMeta(page, pageSize, total) });
});
datasetRouter.post("/", async (req, res) => {
  const input = create.parse(req.body);
  const data = await db.$transaction(async (tx) => {
    const dataset = await tx.dataset.create({
      data: { ...input, ownerId: res.locals.user.id },
    });
    await tx.activity.create({
      data: {
        actorId: res.locals.user.id,
        action: "dataset.create",
        entityType: "dataset",
        entityId: dataset.id,
      },
    });
    return dataset;
  });
  res.status(201).json({ data });
});
datasetRouter.use("/:datasetId", async (req, res, next) => {
  res.locals.dataset = await requireDatasetAccess(
    uuid.parse(req.params.datasetId),
    res.locals.user.id,
  );
  next();
});
datasetRouter.get("/:datasetId", (_req, res) =>
  res.json({ data: res.locals.dataset }),
);
datasetRouter.patch("/:datasetId", async (req, res) => {
  const input = metadata
    .partial()
    .strict()
    .refine((v) => Object.keys(v).length > 0)
    .parse(req.body);
  res.json({
    data: await db.dataset.update({
      where: { id: res.locals.dataset.id },
      data: input,
    }),
  });
});
datasetRouter.delete("/:datasetId", async (_req, res) => {
  await db.$transaction(async (tx) => {
    await tx.dataset.delete({ where: { id: res.locals.dataset.id } });
    await tx.activity.create({
      data: {
        actorId: res.locals.user.id,
        action: "dataset.delete",
        entityType: "dataset",
        entityId: res.locals.dataset.id,
      },
    });
  });
  res.status(204).end();
});
datasetRouter.post(
  "/:datasetId/imports",
  upload.single("file"),
  async (req, res) => {
    if (!req.file || !req.file.originalname.toLowerCase().endsWith(".csv"))
      throw new ApiError(400, "INVALID_FILE", "Sélectionnez un fichier .csv");
    const contentHash = createHash("sha256")
        .update(req.file.buffer)
        .digest("hex"),
      datasetId = res.locals.dataset.id;
    const existing = await db.importJob.findUnique({
      where: { datasetId_contentHash: { datasetId, contentHash } },
    });
    if (existing)
      throw new ApiError(
        409,
        "DUPLICATE_IMPORT",
        "Ce fichier a déjà été importé : " + existing.id,
      );
    let data;
    try {
      data = await db.importJob.create({
        data: {
          datasetId,
          filename: req.file.originalname.replace(/^.*[\\/]/, "").slice(0, 255),
          contentHash,
          source: { create: { content: Uint8Array.from(req.file.buffer) } },
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      )
        throw new ApiError(
          409,
          "DUPLICATE_IMPORT",
          "Ce fichier a déjà été importé",
        );
      throw error;
    }
    res.status(202).json({ data });
  },
);
datasetRouter.get("/:datasetId/imports", async (req, res) => {
  const { page, pageSize } = pagination.parse(req.query),
    where = { datasetId: res.locals.dataset.id };
  const [data, total] = await db.$transaction([
    db.importJob.findMany({
      where,
      orderBy,
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    db.importJob.count({ where }),
  ]);
  res.json({ data, meta: pageMeta(page, pageSize, total) });
});
datasetRouter.use(
  "/:datasetId/imports/:importJobId",
  async (req, res, next) => {
    const job = await db.importJob.findFirst({
      where: {
        id: uuid.parse(req.params.importJobId),
        datasetId: res.locals.dataset.id,
      },
    });
    if (!job) throw new ApiError(404, "NOT_FOUND", "Import introuvable");
    res.locals.job = job;
    next();
  },
);
datasetRouter.get("/:datasetId/imports/:importJobId", (_req, res) =>
  res.json({ data: res.locals.job }),
);
datasetRouter.post(
  "/:datasetId/imports/:importJobId/retry",
  async (req, res) => {
    z.object({})
      .strict()
      .parse(req.body ?? {});
    const result = await db.importJob.updateMany({
      where: { id: res.locals.job.id, status: "failed" },
      data: {
        status: "pending",
        error: null,
        completedAt: null,
        retryCount: { increment: 1 },
      },
    });
    if (!result.count)
      throw new ApiError(
        409,
        "INVALID_STATUS",
        "Seul un import échoué peut être relancé",
      );
    res
      .status(202)
      .json({
        data: await db.importJob.findUniqueOrThrow({
          where: { id: res.locals.job.id },
        }),
      });
  },
);
async function rawPage(
  req: Parameters<typeof pagination.parse>[0],
  datasetId: string,
  jobId?: string,
) {
  const { page, pageSize } = pagination.parse(req);
  // Rejection reports are selected by JSON-array length rather than nullable JSON ambiguity.
  if (jobId) {
    const data = await db.$queryRaw<
      any[]
    >`SELECT * FROM "RawRecord" WHERE "datasetId"=${datasetId}::uuid AND "importJobId"=${jobId}::uuid AND jsonb_typeof("validationErrors")='array' AND jsonb_array_length("validationErrors")>0 ORDER BY "sourceRow" ASC LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`;
    const [count] = await db.$queryRaw<
      { total: bigint }[]
    >`SELECT count(*) AS total FROM "RawRecord" WHERE "datasetId"=${datasetId}::uuid AND "importJobId"=${jobId}::uuid AND jsonb_typeof("validationErrors")='array' AND jsonb_array_length("validationErrors")>0`;
    return { data, meta: pageMeta(page, pageSize, Number(count.total)) };
  }
  const [data, total] = await db.$transaction([
    db.rawRecord.findMany({
      where: { datasetId },
      orderBy: [{ importJobId: "asc" }, { sourceRow: "asc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    db.rawRecord.count({ where: { datasetId } }),
  ]);
  return { data, meta: pageMeta(page, pageSize, total) };
}
datasetRouter.get(
  "/:datasetId/imports/:importJobId/rejections",
  async (req, res) =>
    res.json(
      await rawPage(req.query, res.locals.dataset.id, res.locals.job.id),
    ),
);
datasetRouter.get("/:datasetId/raw-records", async (req, res) =>
  res.json(await rawPage(req.query, res.locals.dataset.id)),
);
