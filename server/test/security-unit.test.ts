import test from "node:test";
import assert from "node:assert/strict";
import {
  hashPassword,
  verifyPassword,
  tokenHash,
} from "../src/shared/security.js";
import { salesFilters, paginatedSalesFilters } from "../src/shared/filters.js";
import { pagination } from "../src/shared/validation.js";
test("passwords have per-account salts; invalid passwords fail", async () => {
  const first = await hashPassword("LongPassword123!"),
    second = await hashPassword("LongPassword123!");
  assert.notEqual(first, second);
  assert.equal(await verifyPassword("LongPassword123!", first), true);
  assert.equal(await verifyPassword("wrong", first), false);
  assert.equal(tokenHash("opaque-token").length, 64);
});
test("shared filters reject ambiguous dates, reverse ranges, repeated values and unknown keys", () => {
  assert.equal(salesFilters.safeParse({ from: "2026-01-01" }).success, false);
  assert.equal(
    salesFilters.safeParse({ from: "2026-02-30T00:00:00Z" }).success,
    false,
  );
  assert.equal(
    salesFilters.safeParse({
      from: "2026-02-01T00:00:00Z",
      to: "2026-01-01T00:00:00Z",
    }).success,
    false,
  );
  assert.equal(
    salesFilters.safeParse({ country: ["France", "Spain"] }).success,
    false,
  );
  assert.equal(salesFilters.safeParse({ ownerId: "someone" }).success, false);
  assert.equal(
    paginatedSalesFilters.safeParse({ pageSize: 101 }).success,
    false,
  );
  assert.deepEqual(pagination.parse({}), { page: 1, pageSize: 20 });
  assert.deepEqual(
    salesFilters.parse({ country: " France ", productCode: "001" }),
    { country: "France", productCode: "001" },
  );
});
