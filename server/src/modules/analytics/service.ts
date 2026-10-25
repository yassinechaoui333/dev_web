import { Prisma } from "@prisma/client";
import { db } from "../../db.js";
import { salesFilters } from "../../shared/filters.js";
import type { z } from "zod";
Prisma.Decimal.set({ precision: 50, rounding: Prisma.Decimal.ROUND_HALF_UP });
export type Filters = z.infer<typeof salesFilters>;
export const money = (value: Prisma.Decimal.Value) =>
  new Prisma.Decimal(value).toFixed(2);
export function scope(datasetId: string, f: Filters = {}) {
  return Prisma.sql`r."datasetId"=${datasetId}::uuid AND j.status='completed'
    ${f.from ? Prisma.sql`AND r."invoiceDate">=${new Date(f.from)}` : Prisma.empty}
    ${f.to ? Prisma.sql`AND r."invoiceDate"<${new Date(f.to)}` : Prisma.empty}
    ${f.country ? Prisma.sql`AND r.country=${f.country}` : Prisma.empty}
    ${f.productCode ? Prisma.sql`AND r."productCode"=${f.productCode}` : Prisma.empty}`;
}
export const tables = Prisma.sql`"SalesRecord" r JOIN "ImportJob" j ON j.id=r."importJobId"`;
export async function summary(
  datasetId: string,
  currency: string,
  filters: Filters = {},
) {
  const [row] = await db.$queryRaw<
    {
      count: bigint;
      orders: bigint;
      net: Prisma.Decimal;
      gross: Prisma.Decimal;
      returns: Prisma.Decimal;
    }[]
  >(Prisma.sql`
    SELECT count(*) AS count, count(DISTINCT r."invoiceNumber") FILTER (WHERE r.quantity>0 AND NOT r."isCancellation") AS orders,
    COALESCE(sum(r.quantity*r."unitPrice"),0) AS net,
    COALESCE(sum(GREATEST(r.quantity*r."unitPrice",0)),0) AS gross,
    abs(COALESCE(sum(LEAST(r.quantity*r."unitPrice",0)),0)) AS returns FROM ${tables} WHERE ${scope(datasetId, filters)}`);
  return {
    currency,
    recordCount: Number(row.count),
    orderCount: Number(row.orders),
    netRevenue: money(row.net),
    grossSales: money(row.gross),
    returnsAmount: money(row.returns),
    averageOrderValue:
      row.orders > 0n ? money(row.net.div(row.orders.toString())) : null,
  };
}
export async function aggregates(
  datasetId: string,
  timezone: string,
  f: Filters,
  kind: "products" | "countries" | "time",
  limit = 10,
  interval = "day",
) {
  if (kind === "products") {
    const rows = await db.$queryRaw<any[]>(
      Prisma.sql`SELECT r."productCode", min(r.description) AS description, sum(r.quantity) AS quantity, sum(r.quantity*r."unitPrice") AS revenue FROM ${tables} WHERE ${scope(datasetId, f)} GROUP BY r."productCode" ORDER BY revenue DESC, r."productCode" ASC LIMIT ${limit}`,
    );
    return rows.map((r) => ({
      productCode: r.productCode,
      description: r.description,
      quantity: r.quantity.toString(),
      netRevenue: money(r.revenue),
    }));
  }
  if (kind === "countries") {
    const rows = await db.$queryRaw<any[]>(
      Prisma.sql`SELECT r.country, count(DISTINCT r."invoiceNumber") FILTER (WHERE r.quantity>0 AND NOT r."isCancellation") AS orders, sum(r.quantity*r."unitPrice") AS revenue FROM ${tables} WHERE ${scope(datasetId, f)} GROUP BY r.country ORDER BY revenue DESC, r.country ASC`,
    );
    return rows.map((r) => ({
      country: r.country,
      orderCount: Number(r.orders),
      netRevenue: money(r.revenue),
    }));
  }
  const rows = await db.$queryRaw<any[]>(Prisma.sql`WITH filtered AS (
    SELECT r.*, date_trunc(${interval},r."invoiceDate" AT TIME ZONE ${timezone}) AT TIME ZONE ${timezone} AS bucket FROM ${tables} WHERE ${scope(datasetId, f)})
    SELECT bucket AS "periodStart", count(DISTINCT "invoiceNumber") FILTER (WHERE quantity>0 AND NOT "isCancellation") AS orders, sum(quantity*"unitPrice") AS revenue FROM filtered GROUP BY bucket ORDER BY bucket ASC`);
  return rows.map((r) => ({
    periodStart: r.periodStart,
    orderCount: Number(r.orders),
    netRevenue: money(r.revenue),
  }));
}
export async function records(
  datasetId: string,
  f: Filters & {
    page: number;
    pageSize: number;
    search?: string;
    sortBy: string;
    sortOrder: string;
  },
) {
  const allowed: Record<string, string> = {
    invoiceDate: '"invoiceDate"',
    invoiceNumber: '"invoiceNumber"',
    productCode: '"productCode"',
    quantity: "quantity",
    unitPrice: '"unitPrice"',
    country: "country",
  };
  const sort = allowed[f.sortBy];
  if (!sort || !["asc", "desc"].includes(f.sortOrder))
    throw new Error("Invalid sort");
  const literal =
    "%" + (f.search ?? "").replace(/[\\%_]/g, "\\$&").toLowerCase() + "%";
  const search = f.search
    ? Prisma.sql`AND (lower(r."invoiceNumber") LIKE ${literal} OR lower(r."productCode") LIKE ${literal} OR lower(r.description) LIKE ${literal} OR lower(coalesce(r."customerId",'')) LIKE ${literal} OR lower(r.country) LIKE ${literal})`
    : Prisma.empty;
  const where = Prisma.sql`${scope(datasetId, f)} ${search}`;
  const [data, count] = await db.$transaction(
    [
      db.$queryRaw<any[]>(
        Prisma.sql`SELECT r.* FROM ${tables} WHERE ${where} ORDER BY r.${Prisma.raw(sort)} ${Prisma.raw(f.sortOrder)}, r.id ${Prisma.raw(f.sortOrder)} LIMIT ${f.pageSize} OFFSET ${(f.page - 1) * f.pageSize}`,
      ),
      db.$queryRaw<{ total: bigint }[]>(
        Prisma.sql`SELECT count(*) AS total FROM ${tables} WHERE ${where}`,
      ),
    ],
    { isolationLevel: "RepeatableRead" },
  );
  return { data, total: Number(count[0].total) };
}
const salesFields = [
  "invoiceNumber",
  "productCode",
  "description",
  "quantity",
  "invoiceDate",
  "unitPrice",
  "customerId",
  "country",
];
export async function quality(datasetId: string, f: Filters) {
  const counts = await db.importJob.aggregate({
    where: { datasetId, status: "completed" },
    _sum: { totalRows: true, acceptedRows: true, rejectedRows: true },
  });
  const acceptedRows = counts._sum.acceptedRows ?? 0,
    sourceRows = counts._sum.totalRows ?? 0,
    rejectedRows = counts._sum.rejectedRows ?? 0;
  const missingByColumn = [];
  for (const column of salesFields) {
    const [r] = await db.$queryRaw<{ missing: bigint }[]>(
      Prisma.sql`SELECT count(*) FILTER (WHERE r.${Prisma.raw('"' + column + '"')} IS NULL OR trim(r.${Prisma.raw('"' + column + '"')}::text)='') AS missing FROM ${tables} WHERE ${scope(datasetId)}`,
    );
    missingByColumn.push({
      column,
      missingCount: Number(r.missing),
      evaluatedRows: acceptedRows,
    });
  }
  const [duplicates] = await db.$queryRaw<{ count: bigint }[]>(
    Prisma.sql`SELECT coalesce(sum(n-1),0)::bigint AS count FROM (SELECT count(*) AS n FROM ${tables} WHERE ${scope(datasetId)} GROUP BY r."invoiceNumber",r."productCode",r.description,r.quantity,r."invoiceDate",r."unitPrice",r."customerId",r.country HAVING count(*)>1) groups`,
  );
  const validity = sourceRows ? (100 * acceptedRows) / sourceRows : 0;
  const completeness = acceptedRows
    ? (100 *
        (7 * acceptedRows -
          missingByColumn
            .filter((m) => m.column !== "customerId")
            .reduce((a, m) => a + m.missingCount, 0))) /
      (7 * acceptedRows)
    : 0;
  const uniqueness = acceptedRows
    ? 100 * (1 - Number(duplicates.count) / acceptedRows)
    : 0;
  const filtered = await summary(datasetId, "", f);
  const round = (n: number) => Math.round(n * 100) / 100;
  return {
    score: round(0.5 * validity + 0.3 * completeness + 0.2 * uniqueness),
    scope: "dataset",
    sourceRows,
    acceptedRows,
    rejectedRows,
    filteredRecordCount: filtered.recordCount,
    missingByColumn,
    duplicateCandidates: {
      count: Number(duplicates.count),
      definition:
        "Même facture, produit, description, quantité, date, prix, client et pays. Candidats à vérifier, pas des doublons certains.",
    },
    components: {
      validity: round(validity),
      completeness: round(completeness),
      uniqueness: round(uniqueness),
    },
    formula: "50 % validité + 30 % complétude + 20 % unicité",
  };
}
export function iqrFlags(
  rows: { id: string; quantity: Prisma.Decimal; unitPrice: Prisma.Decimal }[],
) {
  const flags: {
    recordId: string;
    field: string;
    value: string;
    method: string;
    partition: string;
    lowerBound: string;
    upperBound: string;
  }[] = [];
  for (const partition of ["sales", "returns"]) {
    const group = rows.filter(
      (r) => r.quantity.isNegative() === (partition === "returns"),
    );
    if (group.length < 4) continue;
    for (const field of ["quantity", "unitPrice"] as const) {
      const sorted = group.map((r) => r[field]).sort((a, b) => a.comparedTo(b));
      const quantile = (p: number) => {
        const i = (sorted.length - 1) * p,
          low = Math.floor(i);
        return sorted[low].add(
          sorted[Math.ceil(i)].sub(sorted[low]).mul(i - low),
        );
      };
      const q1 = quantile(0.25),
        q3 = quantile(0.75),
        span = q3.sub(q1).mul(1.5),
        lower = q1.sub(span),
        upper = q3.add(span);
      for (const row of group)
        if (row[field].lt(lower) || row[field].gt(upper))
          flags.push({
            recordId: row.id,
            field,
            value: row[field].toString(),
            method: "iqr",
            partition,
            lowerBound: lower.toString(),
            upperBound: upper.toString(),
          });
    }
  }
  return flags.sort(
    (a, b) =>
      a.recordId.localeCompare(b.recordId) || a.field.localeCompare(b.field),
  );
}
export async function outliers(datasetId: string, f: Filters) {
  const rows = await db.$queryRaw<
    { id: string; quantity: Prisma.Decimal; unitPrice: Prisma.Decimal }[]
  >(
    Prisma.sql`SELECT r.id,r.quantity,r."unitPrice",r."invoiceNumber",r."productCode",raw."sourceRow" FROM ${tables} JOIN "RawRecord" raw ON raw.id=r."rawRecordId" WHERE ${scope(datasetId, f)}`,
  );
  const indexed = new Map(rows.map((r) => [r.id, r as any]));
  return iqrFlags(rows).map((flag) => ({
    ...flag,
    invoiceNumber: indexed.get(flag.recordId).invoiceNumber,
    productCode: indexed.get(flag.recordId).productCode,
    sourceRow: indexed.get(flag.recordId).sourceRow,
  }));
}
export function changes(current: string | null, previous: string | null) {
  if (current === null || previous === null)
    return { delta: null, percent: null };
  const delta = new Prisma.Decimal(current).sub(previous);
  return {
    delta: money(delta),
    percent: new Prisma.Decimal(previous).isZero()
      ? null
      : money(delta.div(new Prisma.Decimal(previous).abs()).mul(100)),
  };
}
