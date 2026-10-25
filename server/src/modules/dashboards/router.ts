import { Router } from "express";
import { z } from "zod";
import { db } from "../../db.js";
import { authenticate } from "../../shared/security.js";
import {
  requireDatasetAccess,
  requireDashboardAccess,
} from "../../shared/access.js";
import { ApiError } from "../../shared/errors.js";
import { pagination, pageMeta, uuid, email } from "../../shared/validation.js";
import { dashboardConfig } from "./config.js";
import { dashboardData } from "./data.js";
export const dashboardRouter = Router();
dashboardRouter.use(authenticate);
const title = z.string().trim().min(1).max(200),
  orderBy = [{ createdAt: "desc" as const }, { id: "desc" as const }];
const output = (d: any, userId: string) => ({
  ...d,
  config: dashboardConfig.parse(d.config),
  access: d.ownerId === userId ? "owner" : "read",
});
dashboardRouter.get("/", async (req, res) => {
  const { page, pageSize } = pagination.parse(req.query),
    where = {
      OR: [
        { ownerId: res.locals.user.id },
        { shares: { some: { userId: res.locals.user.id } } },
      ],
    };
  const [data, total] = await db.$transaction([
    db.dashboard.findMany({
      where,
      orderBy,
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    db.dashboard.count({ where }),
  ]);
  res.json({
    data: data.map((d) => output(d, res.locals.user.id)),
    meta: pageMeta(page, pageSize, total),
  });
});
dashboardRouter.post("/", async (req, res) => {
  const input = z
    .object({ title, datasetId: uuid, config: dashboardConfig })
    .strict()
    .parse(req.body);
  await requireDatasetAccess(input.datasetId, res.locals.user.id);
  const data = await db.dashboard.create({
    data: { ...input, ownerId: res.locals.user.id },
  });
  res.status(201).json({ data: output(data, res.locals.user.id) });
});
dashboardRouter.use("/:dashboardId", async (req, res, next) => {
  res.locals.dashboard = await requireDashboardAccess(
    uuid.parse(req.params.dashboardId),
    res.locals.user.id,
    !["GET", "HEAD"].includes(req.method),
  );
  next();
});
dashboardRouter.get("/:dashboardId", (_req, res) =>
  res.json({ data: output(res.locals.dashboard, res.locals.user.id) }),
);
dashboardRouter.patch("/:dashboardId", async (req, res) => {
  const input = z
    .object({ title: title.optional(), config: dashboardConfig.optional() })
    .strict()
    .refine((v) => Object.keys(v).length > 0)
    .parse(req.body);
  res.json({
    data: output(
      await db.dashboard.update({
        where: { id: res.locals.dashboard.id },
        data: input,
      }),
      res.locals.user.id,
    ),
  });
});
dashboardRouter.delete("/:dashboardId", async (_req, res) => {
  await db.dashboard.delete({ where: { id: res.locals.dashboard.id } });
  res.status(204).end();
});
dashboardRouter.get("/:dashboardId/data", async (req, res) => {
  z.object({}).strict().parse(req.query);
  const d = res.locals.dashboard,
    config = dashboardConfig.parse(d.config),
    dataset = await db.dataset.findUniqueOrThrow({
      where: { id: d.datasetId },
    });
  res.json({
    data: await dashboardData(dataset, config),
    meta: { currency: dataset.currency, timezone: dataset.timezone },
  });
});
dashboardRouter.get("/:dashboardId/shares", async (req, res) => {
  await requireDashboardAccess(
    res.locals.dashboard.id,
    res.locals.user.id,
    true,
  );
  const { page, pageSize } = pagination.parse(req.query),
    where = { dashboardId: res.locals.dashboard.id };
  const [data, total] = await db.$transaction([
    db.dashboardShare.findMany({
      where,
      orderBy,
      include: { user: { select: { name: true, email: true } } },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    db.dashboardShare.count({ where }),
  ]);
  res.json({ data, meta: pageMeta(page, pageSize, total) });
});
dashboardRouter.post("/:dashboardId/shares", async (req, res) => {
  const input = z
    .object({ userId: uuid.optional(), email: email.optional() })
    .strict()
    .refine(
      (v) => !!v.userId !== !!v.email,
      "Indiquez un utilisateur ou un email",
    )
    .parse(req.body);
  const user = await db.user.findFirst({
    where: {
      active: true,
      ...(input.userId ? { id: input.userId } : { email: input.email }),
    },
    select: { id: true },
  });
  if (!user)
    throw new ApiError(404, "NOT_FOUND", "Utilisateur inscrit introuvable");
  if (user.id === res.locals.user.id)
    throw new ApiError(400, "INVALID_SHARE", "Vous êtes déjà propriétaire");
  const where = {
    dashboardId_userId: {
      dashboardId: res.locals.dashboard.id,
      userId: user.id,
    },
  };
  const data = await db.$transaction(async (tx) => {
    const share = await tx.dashboardShare.upsert({
      where,
      update: {},
      create: where.dashboardId_userId,
    });
    await tx.activity.create({
      data: {
        actorId: res.locals.user.id,
        action: "dashboard.share",
        entityType: "dashboard",
        entityId: res.locals.dashboard.id,
        metadata: { userId: user.id },
      },
    });
    return share;
  });
  res.status(201).json({ data });
});
dashboardRouter.delete("/:dashboardId/shares/:userId", async (req, res) => {
  await db.$transaction(async (tx) => {
    await tx.dashboardShare.deleteMany({
      where: {
        dashboardId: res.locals.dashboard.id,
        userId: uuid.parse(req.params.userId),
      },
    });
    await tx.activity.create({
      data: {
        actorId: res.locals.user.id,
        action: "dashboard.revoke",
        entityType: "dashboard",
        entityId: res.locals.dashboard.id,
      },
    });
  });
  res.status(204).end();
});
