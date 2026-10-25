import { z } from "zod";
import { salesFilters } from "../../shared/filters.js";
import { uuid } from "../../shared/validation.js";
export const dashboardConfig = z
  .object({
    version: z.literal(1),
    filters: salesFilters,
    charts: z
      .array(
        z
          .object({
            id: uuid,
            title: z.string().trim().min(1).max(100),
            type: z.enum(["kpi", "bar", "line", "pie"]),
            metric: z.enum([
              "netRevenue",
              "orderCount",
              "averageOrderValue",
              "quantity",
              "recordCount",
            ]),
            groupBy: z.enum(["day", "country", "productCode"]),
          })
          .strict(),
      )
      .min(1)
      .max(8),
    layout: z
      .array(
        z
          .object({
            chartId: uuid,
            x: z.number().int().min(0).max(11),
            y: z.number().int().min(0).max(100),
            width: z.number().int().min(1).max(12),
            height: z.number().int().min(1).max(12),
          })
          .strict(),
      )
      .min(1)
      .max(8),
  })
  .strict()
  .refine(
    (v) => new Set(v.charts.map((c) => c.id)).size === v.charts.length,
    "Identifiants dupliqués",
  )
  .refine(
    (v) =>
      v.layout.length === v.charts.length &&
      new Set(v.layout.map((l) => l.chartId)).size === v.charts.length &&
      v.layout.every(
        (l) => v.charts.some((c) => c.id === l.chartId) && l.x + l.width <= 12,
      ),
    "Disposition invalide",
  )
  .refine(
    (v) =>
      v.layout.every((a, i) =>
        v.layout
          .slice(i + 1)
          .every(
            (b) =>
              a.x + a.width <= b.x ||
              b.x + b.width <= a.x ||
              a.y + a.height <= b.y ||
              b.y + b.height <= a.y,
          ),
      ),
    "Les widgets ne doivent pas se chevaucher",
  );
export type DashboardConfig = z.infer<typeof dashboardConfig>;
