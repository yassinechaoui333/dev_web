import { Prisma } from "@prisma/client";
import { db } from "../../db.js";
import { summary, scope, tables, money } from "../analytics/service.js";
import type { DashboardConfig } from "./config.js";
export async function dashboardData(
  dataset: { id: string; currency: string; timezone: string },
  config: DashboardConfig,
) {
  const stats = await summary(dataset.id, dataset.currency, config.filters),
    data = [];
  for (const chart of config.charts) {
    const metric = {
      netRevenue: Prisma.sql`sum(quantity*"unitPrice")`,
      orderCount: Prisma.sql`count(DISTINCT "invoiceNumber") FILTER (WHERE quantity>0 AND NOT "isCancellation")`,
      averageOrderValue: Prisma.sql`sum(quantity*"unitPrice")/NULLIF(count(DISTINCT "invoiceNumber") FILTER (WHERE quantity>0 AND NOT "isCancellation"),0)`,
      quantity: Prisma.sql`sum(quantity)`,
      recordCount: Prisma.sql`count(*)`,
    }[chart.metric];
    if (chart.type === "kpi") {
      let value: string | null;
      if (chart.metric === "quantity") {
        const [r] = await db.$queryRaw<any[]>(
          Prisma.sql`SELECT coalesce(sum(r.quantity),0) AS value FROM ${tables} WHERE ${scope(dataset.id, config.filters)}`,
        );
        value = r.value.toString();
      } else value = String(stats[chart.metric as keyof typeof stats] ?? "");
      if (
        chart.metric === "averageOrderValue" &&
        stats.averageOrderValue === null
      )
        value = null;
      data.push({ chartId: chart.id, points: [{ label: chart.title, value }] });
      continue;
    }
    const label =
      chart.groupBy === "day"
        ? Prisma.sql`to_char(r."invoiceDate" AT TIME ZONE ${dataset.timezone},'YYYY-MM-DD')`
        : chart.groupBy === "country"
          ? Prisma.sql`r.country`
          : Prisma.sql`r."productCode"`;
    const rows = await db.$queryRaw<any[]>(
      Prisma.sql`WITH filtered AS (SELECT r.*,${label} AS label FROM ${tables} WHERE ${scope(dataset.id, config.filters)}) SELECT label,${metric} AS value FROM filtered GROUP BY label ORDER BY ${chart.groupBy === "day" ? Prisma.sql`label ASC` : Prisma.sql`value DESC NULLS LAST,label ASC`} ${chart.groupBy === "day" ? Prisma.empty : Prisma.sql`LIMIT 10`}`,
    );
    data.push({
      chartId: chart.id,
      points: rows.map((r) => ({
        label: r.label,
        value:
          r.value === null
            ? null
            : ["netRevenue", "averageOrderValue"].includes(chart.metric)
              ? money(r.value)
              : r.value.toString(),
      })),
    });
  }
  return data;
}
