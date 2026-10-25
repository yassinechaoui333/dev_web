import { Router } from "express";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { db } from "../../db.js";
import { authenticate } from "../../shared/security.js";
import { requireDatasetAccess } from "../../shared/access.js";
import { ApiError } from "../../shared/errors.js";
import { salesFilters } from "../../shared/filters.js";
import { pagination, pageMeta, uuid } from "../../shared/validation.js";
import {
  summary,
  aggregates,
  records,
  quality,
  outliers,
  changes,
  scope,
  tables,
} from "./service.js";
export const analyticsRouter = Router({ mergeParams: true });
analyticsRouter.use(authenticate, async (req, res, next) => {
  res.locals.dataset = await requireDatasetAccess(
    uuid.parse(req.params.datasetId),
    res.locals.user.id,
  );
  next();
});
const filtered = salesFilters;
const pageFilter = pagination.extend(filtered.shape);
const intervalValid = (v: { from?: string; to?: string }) =>
  !v.from || !v.to || new Date(v.from) < new Date(v.to);
analyticsRouter.get("/summary", async (req, res) =>
  res.json({
    data: await summary(
      res.locals.dataset.id,
      res.locals.dataset.currency,
      filtered.parse(req.query),
    ),
  }),
);
analyticsRouter.get("/top-products", async (req, res) => {
  const f = z
    .object({
      ...filtered.shape,
      limit: z.coerce.number().int().min(1).max(100).default(10),
    })
    .strict()
    .refine(intervalValid)
    .parse(req.query);
  res.json({
    data: await aggregates(
      res.locals.dataset.id,
      res.locals.dataset.timezone,
      f,
      "products",
      f.limit,
    ),
  });
});
analyticsRouter.get("/sales-by-country", async (req, res) =>
  res.json({
    data: await aggregates(
      res.locals.dataset.id,
      res.locals.dataset.timezone,
      filtered.parse(req.query),
      "countries",
    ),
  }),
);
analyticsRouter.get("/revenue-over-time", async (req, res) => {
  const f = z
    .object({
      ...filtered.shape,
      interval: z.enum(["day", "week", "month"]).default("day"),
    })
    .strict()
    .refine(intervalValid)
    .parse(req.query);
  res.json({
    data: await aggregates(
      res.locals.dataset.id,
      res.locals.dataset.timezone,
      f,
      "time",
      10,
      f.interval,
    ),
  });
});
analyticsRouter.get("/records", async (req, res) => {
  const f = pageFilter
    .extend({
      search: z.string().max(200).optional(),
      sortBy: z
        .enum([
          "invoiceDate",
          "invoiceNumber",
          "productCode",
          "quantity",
          "unitPrice",
          "country",
        ])
        .default("invoiceDate"),
      sortOrder: z.enum(["asc", "desc"]).default("desc"),
    })
    .strict()
    .refine(intervalValid)
    .parse(req.query);
  const result = await records(res.locals.dataset.id, f);
  res.json({
    data: result.data,
    meta: pageMeta(f.page, f.pageSize, result.total),
  });
});
analyticsRouter.get("/info", async (req, res) => {
  z.object({}).strict().parse(req.query);
  const d = res.locals.dataset;
  const stats = await summary(d.id, d.currency);
  res.json({
    data: {
      datasetId: d.id,
      title: d.title,
      currency: d.currency,
      timezone: d.timezone,
      recordCount: stats.recordCount,
      columns: [
        "invoiceNumber",
        "productCode",
        "description",
        "quantity",
        "invoiceDate",
        "unitPrice",
        "customerId",
        "country",
      ].map((key) => ({
        key,
        type: ["quantity", "unitPrice"].includes(key)
          ? "decimal"
          : key === "invoiceDate"
            ? "datetime"
            : "string",
        nullable: key === "customerId",
      })),
    },
  });
});
analyticsRouter.get("/quality", async (req, res) =>
  res.json({
    data: await quality(res.locals.dataset.id, filtered.parse(req.query)),
  }),
);
analyticsRouter.get("/outliers", async (req, res) => {
  const f = pageFilter.strict().refine(intervalValid).parse(req.query);
  const flags = await outliers(res.locals.dataset.id, f);
  res.json({
    data: flags.slice((f.page - 1) * f.pageSize, f.page * f.pageSize),
    meta: pageMeta(f.page, f.pageSize, flags.length),
  });
});
analyticsRouter.get("/comparison", async (req, res) => {
  const input = z
    .object({
      ...filtered.shape,
      compareDatasetId: uuid.optional(),
      compareFrom: z.iso.datetime({ offset: true }).optional(),
      compareTo: z.iso.datetime({ offset: true }).optional(),
    })
    .strict()
    .refine(intervalValid)
    .refine(
      (v) => !!v.compareDatasetId || !!(v.compareFrom && v.compareTo),
      "Choisissez un dataset ou une période de référence",
    )
    .refine(
      (v) => !!v.compareFrom === !!v.compareTo,
      "Indiquez les deux dates de référence",
    )
    .refine(
      (v) =>
        !v.compareFrom ||
        !v.compareTo ||
        new Date(v.compareFrom) < new Date(v.compareTo),
    )
    .parse(req.query);
  const d = res.locals.dataset,
    other = input.compareDatasetId
      ? await requireDatasetAccess(input.compareDatasetId, res.locals.user.id)
      : d;
  if (d.currency !== other.currency)
    throw new ApiError(
      400,
      "INCOMPATIBLE_CURRENCY",
      "Les devises doivent être identiques",
    );
  const previousFilters = {
    country: input.country,
    productCode: input.productCode,
    from: input.compareFrom ?? input.from,
    to: input.compareTo ?? input.to,
  };
  const [current, previous] = await Promise.all([
    summary(d.id, d.currency, input),
    summary(other.id, other.currency, previousFilters),
  ]);
  const revenue = changes(current.netRevenue, previous.netRevenue),
    orders = changes(String(current.orderCount), String(previous.orderCount)),
    aov = changes(current.averageOrderValue, previous.averageOrderValue);
  res.json({
    data: {
      current,
      previous,
      currentLabel:
        d.title + " · " + (input.from ?? "début") + " → " + (input.to ?? "fin"),
      previousLabel:
        other.title +
        " · " +
        (previousFilters.from ?? "début") +
        " → " +
        (previousFilters.to ?? "fin"),
      netRevenueDelta: revenue.delta,
      netRevenuePercent: revenue.percent,
      orderCountDelta: current.orderCount - previous.orderCount,
      orderCountPercent: orders.percent,
      averageOrderValueDelta: aov.delta,
      averageOrderValuePercent: aov.percent,
    },
  });
});
