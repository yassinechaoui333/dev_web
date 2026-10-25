import test, { after } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { Prisma } from "@prisma/client";
import { app } from "../src/app.js";
import { db } from "../src/db.js";
import { config } from "../src/config.js";
import { hashPassword } from "../src/shared/security.js";
import { parseSalesCsv } from "../src/modules/datasets/parser.js";
import { processImport } from "../src/modules/datasets/worker.js";
import { iqrFlags } from "../src/modules/analytics/service.js";
if (process.env.NODE_ENV === "production")
  throw new Error("No production tests");
const headers = { Origin: config.origin, "X-Requested-With": "SalesPlatform" },
  ids: string[] = [];
async function user() {
  const u = await db.user.create({
    data: {
      name: "Platform test",
      email: "platform-" + randomUUID() + "@example.test",
      passwordHash: await hashPassword("PlatformTest123!"),
    },
  });
  ids.push(u.id);
  const agent = request.agent(app);
  await agent
    .post("/api/auth/login")
    .set(headers)
    .send({ email: u.email, password: "PlatformTest123!" })
    .expect(200);
  return { u, agent };
}
after(async () => {
  await db.dashboard.deleteMany({ where: { ownerId: { in: ids } } });
  await db.dataset.deleteMany({ where: { ownerId: { in: ids } } });
  await db.activity.deleteMany({ where: { actorId: { in: ids } } });
  await db.user.deleteMany({ where: { id: { in: ids } } });
  await db.$disconnect();
});
test("complete CSV → analytics → saved dashboard → sharing → revoke flow", async () => {
  const owner = await user(),
    viewer = await user();
  const created = await owner.agent
      .post("/api/datasets")
      .set(headers)
      .send({ title: "CSV test", currency: "GBP", description: "Fictional" })
      .expect(201),
    d = created.body.data.id;
  await viewer.agent.get("/api/datasets/" + d).expect(404);
  const csv = await readFile(
    new URL("../../fixtures/ventes-demo.csv", import.meta.url),
  );
  const upload = await owner.agent
      .post("/api/datasets/" + d + "/imports")
      .set(headers)
      .attach("file", csv, "sales.csv")
      .expect(202),
    job = upload.body.data.id;
  const before = await owner.agent
    .get("/api/datasets/" + d + "/analytics/summary")
    .expect(200);
  assert.equal(before.body.data.recordCount, 0);
  await owner.agent
    .post("/api/datasets/" + d + "/imports")
    .set(headers)
    .attach("file", csv, "renamed.csv")
    .expect(409);
  await processImport(job);
  const result = await owner.agent
    .get("/api/datasets/" + d + "/imports/" + job)
    .expect(200);
  assert.equal(result.body.data.status, "completed");
  assert.equal(result.body.data.acceptedRows, 8);
  assert.equal(result.body.data.rejectedRows, 2);
  const rejection = await owner.agent
    .get("/api/datasets/" + d + "/imports/" + job + "/rejections")
    .expect(200);
  assert.deepEqual(
    rejection.body.data.map((r: any) => r.sourceRow),
    [10, 11],
  );
  const summary = await owner.agent
    .get("/api/datasets/" + d + "/analytics/summary")
    .expect(200);
  assert.equal(summary.body.data.netRevenue, "141.75");
  assert.equal(summary.body.data.orderCount, 6);
  assert.equal(summary.body.data.averageOrderValue, "23.63");
  const period = await owner.agent
    .get(
      "/api/datasets/" +
        d +
        "/analytics/summary?from=2026-01-10T00:00:00Z&to=2026-01-11T00:00:00Z",
    )
    .expect(200);
  assert.equal(period.body.data.netRevenue, "38.00");
  assert.equal(period.body.data.orderCount, 1);
  const empty = await owner.agent
    .get("/api/datasets/" + d + "/analytics/summary?from=2030-01-01T00:00:00Z")
    .expect(200);
  assert.equal(empty.body.data.netRevenue, "0.00");
  assert.equal(empty.body.data.averageOrderValue, null);
  const rows = await owner.agent
    .get(
      "/api/datasets/" +
        d +
        "/analytics/records?pageSize=2&sortBy=quantity&sortOrder=desc",
    )
    .expect(200);
  assert.equal(rows.body.meta.total, 8);
  assert.equal(rows.body.data[0].quantity, "100");
  assert.equal(rows.body.data.length, 2);
  await owner.agent
    .get("/api/datasets/" + d + "/analytics/records?sortBy=passwordHash")
    .expect(400);
  const products = await owner.agent
    .get("/api/datasets/" + d + "/analytics/top-products")
    .expect(200);
  assert.equal(products.body.data[0].productCode, "004");
  assert.equal(products.body.data[0].netRevenue, "103.00");
  await owner.agent
    .get("/api/datasets/" + d + "/analytics/revenue-over-time?interval=day")
    .expect(200);
  const quality = await owner.agent
    .get("/api/datasets/" + d + "/analytics/quality")
    .expect(200);
  assert.equal(quality.body.data.score, 90);
  assert.equal(
    quality.body.data.missingByColumn.find(
      (c: any) => c.column === "customerId",
    ).missingCount,
    1,
  );
  const outliers = await owner.agent
    .get("/api/datasets/" + d + "/analytics/outliers")
    .expect(200);
  assert.ok(
    outliers.body.data.some(
      (r: any) => r.field === "quantity" && r.value === "100",
    ),
  );
  assert.ok(outliers.body.data.every((r: any) => r.partition === "sales"));
  const comparison = await owner.agent
    .get(
      "/api/datasets/" +
        d +
        "/analytics/comparison?compareFrom=2030-01-01T00:00:00Z&compareTo=2030-02-01T00:00:00Z",
    )
    .expect(200);
  assert.equal(comparison.body.data.netRevenuePercent, null);
  const unauthorized = await owner.agent
    .get(
      "/api/datasets/" +
        d +
        "/analytics/comparison?compareDatasetId=" +
        randomUUID(),
    )
    .expect(404);
  const wrongCurrency = await owner.agent
    .post("/api/datasets")
    .set(headers)
    .send({ title: "EUR", currency: "EUR" })
    .expect(201);
  await owner.agent
    .get(
      "/api/datasets/" +
        d +
        "/analytics/comparison?compareDatasetId=" +
        wrongCurrency.body.data.id,
    )
    .expect(400);
  const chartId = randomUUID(),
    config = {
      version: 1,
      filters: { country: "France" },
      charts: [
        {
          id: chartId,
          title: "CA France",
          type: "kpi",
          metric: "netRevenue",
          groupBy: "day",
        },
      ],
      layout: [{ chartId, x: 0, y: 0, width: 12, height: 1 }],
    };
  const dashboard = await owner.agent
      .post("/api/dashboards")
      .set(headers)
      .send({ title: "Saved test", datasetId: d, config })
      .expect(201),
    dash = dashboard.body.data.id;
  await viewer.agent.get("/api/dashboards/" + dash).expect(404);
  await owner.agent
    .post("/api/dashboards/" + dash + "/shares")
    .set(headers)
    .send({ email: viewer.u.email })
    .expect(201);
  const read = await viewer.agent.get("/api/dashboards/" + dash).expect(200);
  assert.equal(read.body.data.access, "read");
  assert.deepEqual(read.body.data.config, config);
  const data = await viewer.agent
    .get("/api/dashboards/" + dash + "/data")
    .expect(200);
  assert.equal(data.body.data[0].points[0].value, "109.00");
  await viewer.agent
    .get("/api/dashboards/" + dash + "/data?country=United%20Kingdom")
    .expect(400);
  await viewer.agent
    .get("/api/datasets/" + d + "/analytics/summary")
    .expect(404);
  await viewer.agent
    .patch("/api/dashboards/" + dash)
    .set(headers)
    .send({ title: "Hacked" })
    .expect(404);
  await viewer.agent.get("/api/dashboards/" + dash + "/shares").expect(404);
  await owner.agent
    .delete("/api/dashboards/" + dash + "/shares/" + viewer.u.id)
    .set(headers)
    .expect(204);
  await viewer.agent.get("/api/dashboards/" + dash + "/data").expect(404);
  await owner.agent
    .patch("/api/dashboards/" + dash)
    .set(headers)
    .send({ title: "Renamed" })
    .expect(200);
  await owner.agent
    .delete("/api/datasets/" + d)
    .set(headers)
    .expect(204);
  assert.equal(await db.importSource.count({ where: { importJobId: job } }), 0);
  assert.equal(await db.dashboard.count({ where: { id: dash } }), 0);
});
test("malformed CSV fails atomically; retry is safe; cross-owner and file-size checks", async () => {
  const a = await user(),
    b = await user(),
    created = await a.agent
      .post("/api/datasets")
      .set(headers)
      .send({ title: "Bad source", currency: "GBP" })
      .expect(201),
    id = created.body.data.id;
  const malformed = Buffer.from(
    'InvoiceNo,StockCode,Description,Quantity,InvoiceDate,UnitPrice,CustomerID,Country\n"unclosed',
  );
  const job = (
    await a.agent
      .post("/api/datasets/" + id + "/imports")
      .set(headers)
      .attach("file", malformed, "bad.csv")
      .expect(202)
  ).body.data.id;
  await b.agent
    .post("/api/datasets/" + id + "/imports")
    .set(headers)
    .attach("file", malformed, "bad.csv")
    .expect(404);
  await b.agent
    .delete("/api/datasets/" + id)
    .set(headers)
    .expect(404);
  await processImport(job);
  assert.equal(
    (await db.importJob.findUniqueOrThrow({ where: { id: job } })).status,
    "failed",
  );
  assert.equal(await db.salesRecord.count({ where: { importJobId: job } }), 0);
  await a.agent
    .post("/api/datasets/" + id + "/imports/" + job + "/retry")
    .set(headers)
    .send({})
    .expect(202);
  await processImport(job);
  const retried = await db.importJob.findUniqueOrThrow({ where: { id: job } });
  assert.equal(retried.retryCount, 1);
  assert.equal(retried.status, "failed");
  assert.equal(await db.rawRecord.count({ where: { importJobId: job } }), 0);
  await a.agent
    .post("/api/datasets/" + id + "/imports")
    .set(headers)
    .attach("file", Buffer.alloc(10 * 1024 * 1024 + 1), "large.csv")
    .expect(413);
  const header =
    "InvoiceNo,StockCode,Description,Quantity,InvoiceDate,UnitPrice,CustomerID,Country\n";
  const parseDate = (value: string) =>
    parseSalesCsv(
      Buffer.from(header + "INV-01,001,Tasse,1," + value + ",1,00042,France"),
      { dateFormat: "DMY_HM", timezone: "Europe/Paris" },
    )[0];
  assert.ok(
    parseDate("29/03/2026 02:30").errors.some((e) => e.field === "InvoiceDate"),
  );
  assert.ok(
    parseDate("25/10/2026 02:30").errors.some((e) => e.field === "InvoiceDate"),
  );
  const valid = parseDate("01/01/2026 12:00");
  assert.equal(valid.errors.length, 0);
  assert.equal(valid.clean.customerId, "00042");
  assert.equal(valid.clean.productCode, "001");
  assert.equal(
    valid.clean.invoiceDate.toISOString(),
    "2026-01-01T11:00:00.000Z",
  );
  const before = await db.dataset.findUniqueOrThrow({ where: { id } });
  await a.agent
    .patch("/api/datasets/" + id)
    .set(headers)
    .send({ title: "Renamed dataset" })
    .expect(200);
  assert.equal(
    (await db.dataset.findUniqueOrThrow({ where: { id } })).description,
    before.description,
  );
});
test("IQR handles small sets, zero IQR and valid returns", () => {
  const row = (q: number) => ({
    id: randomUUID(),
    quantity: new Prisma.Decimal(q),
    unitPrice: new Prisma.Decimal(1),
  });
  assert.equal(iqrFlags([row(1), row(1), row(100)]).length, 0);
  assert.equal(iqrFlags([row(1), row(1), row(1), row(1), row(-100)]).length, 0);
  assert.ok(
    iqrFlags([row(1), row(1), row(1), row(1), row(100)]).some(
      (r) => r.value === "100",
    ),
  );
});
