import test, { after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { app } from "../src/app.js";
import { db } from "../src/db.js";
import { config } from "../src/config.js";
import { hashPassword } from "../src/shared/security.js";
import {
  requireDatasetAccess,
  requireDashboardAccess,
} from "../src/shared/access.js";
if (process.env.NODE_ENV === "production")
  throw new Error("Tests cannot run in production");
const headers = { Origin: config.origin, "X-Requested-With": "SalesPlatform" };
const password = "TestAccount123!";
const userIds: string[] = [];
async function account(role: "USER" | "ADMIN" = "USER") {
  const email = "test-" + randomUUID() + "@example.test";
  const user = await db.user.create({
    data: {
      name: "Test " + role,
      email,
      role,
      passwordHash: await hashPassword(password),
    },
  });
  userIds.push(user.id);
  const agent = request.agent(app);
  await agent
    .post("/api/auth/login")
    .set(headers)
    .send({ email, password })
    .expect(200);
  return { user, agent };
}
after(async () => {
  await db.dashboard.deleteMany({ where: { ownerId: { in: userIds } } });
  await db.dataset.deleteMany({ where: { ownerId: { in: userIds } } });
  await db.activity.deleteMany({
    where: {
      OR: [{ actorId: { in: userIds } }, { entityId: { in: userIds } }],
    },
  });
  await db.user.deleteMany({ where: { id: { in: userIds } } });
  await db.$disconnect();
});
test("anonymous and member accounts cannot access admin endpoints or escalate role", async () => {
  const { user, agent } = await account();
  for (const path of ["users", "summary", "datasets", "activities"]) {
    await request(app)
      .get("/api/admin/" + path)
      .expect(401);
    await agent.get("/api/admin/" + path).expect(403);
  }
  await agent
    .patch("/api/admin/users/" + user.id)
    .set(headers)
    .send({ role: "ADMIN" })
    .expect(403);
  await agent
    .patch("/api/auth/profile")
    .set(headers)
    .send({ name: "New Name", role: "ADMIN" })
    .expect(400);
  assert.equal(
    (await db.user.findUniqueOrThrow({ where: { id: user.id } })).role,
    "USER",
  );
});
test("admin account changes revoke sessions and audit safe before/after values", async () => {
  const admin = await account("ADMIN"),
    target = await account();
  await admin.agent
    .patch("/api/admin/users/" + admin.user.id)
    .set(headers)
    .send({ active: false })
    .expect(409);
  await admin.agent
    .patch("/api/admin/users/not-an-id")
    .set(headers)
    .send({ active: false })
    .expect(400);
  await admin.agent
    .patch("/api/admin/users/" + target.user.id)
    .set(headers)
    .send({ passwordHash: "bad" })
    .expect(400);
  await admin.agent
    .patch("/api/admin/users/" + target.user.id)
    .set({ ...headers, Origin: "https://attacker.test" })
    .send({ role: "ADMIN" })
    .expect(403);
  await admin.agent
    .patch("/api/admin/users/" + target.user.id)
    .set(headers)
    .send({ role: "ADMIN" })
    .expect(200);
  await target.agent.get("/api/auth/me").expect(401);
  await target.agent
    .post("/api/auth/login")
    .set(headers)
    .send({ email: target.user.email, password })
    .expect(200);
  await target.agent.get("/api/admin/summary").expect(200);
  await admin.agent
    .patch("/api/admin/users/" + target.user.id)
    .set(headers)
    .send({ active: false })
    .expect(200);
  await target.agent.get("/api/admin/summary").expect(401);
  await target.agent
    .post("/api/auth/login")
    .set(headers)
    .send({ email: target.user.email, password })
    .expect(401);
  const log = await db.activity.findFirstOrThrow({
    where: { entityId: target.user.id, action: "admin.user_update" },
  });
  assert.ok(log.metadata);
  assert.equal(JSON.stringify(log).includes("passwordHash"), false);
  for (const query of [
    "page=0",
    "pageSize=101",
    "page=1&page=2",
    "unexpected=true",
  ])
    await admin.agent.get("/api/admin/users?" + query).expect(400);
  const users = await admin.agent
    .get("/api/admin/users?pageSize=1")
    .expect(200);
  assert.equal(users.body.data.length, 1);
  assert.equal(users.body.meta.pageSize, 1);
  assert.equal("passwordHash" in users.body.data[0], false);
  const activities = await admin.agent.get("/api/admin/activities").expect(200);
  assert.ok(
    activities.body.data.some(
      (a: { action: string }) => a.action === "admin.user_update",
    ),
  );
});
test("profile email changes verify password; password changes revoke every session", async () => {
  const { user, agent } = await account();
  await agent
    .patch("/api/auth/profile")
    .set(headers)
    .send({ name: "Updated Analyst" })
    .expect(200);
  const newEmail = "test-" + randomUUID() + "@example.test";
  await agent
    .patch("/api/auth/profile")
    .set(headers)
    .send({ email: newEmail })
    .expect(400);
  await agent
    .patch("/api/auth/profile")
    .set(headers)
    .send({ email: newEmail, currentPassword: "wrong" })
    .expect(400);
  const other = request.agent(app);
  await other
    .post("/api/auth/login")
    .set(headers)
    .send({ email: user.email, password })
    .expect(200);
  await agent
    .patch("/api/auth/profile")
    .set(headers)
    .send({ email: newEmail, currentPassword: password })
    .expect(200);
  await other.get("/api/auth/me").expect(401);
  await other
    .post("/api/auth/login")
    .set(headers)
    .send({ email: newEmail, password })
    .expect(200);
  await agent
    .patch("/api/auth/password")
    .set(headers)
    .send({ currentPassword: "wrong", newPassword: "Replacement123!" })
    .expect(400);
  await agent
    .patch("/api/auth/password")
    .set(headers)
    .send({ currentPassword: password, newPassword: "Replacement123!" })
    .expect(204);
  await agent.get("/api/auth/me").expect(401);
  await other.get("/api/auth/me").expect(401);
  await agent
    .post("/api/auth/login")
    .set(headers)
    .send({ email: newEmail, password })
    .expect(401);
  await agent
    .post("/api/auth/login")
    .set(headers)
    .send({ email: newEmail, password: "Replacement123!" })
    .expect(200);
});
test("concurrent administrator demotions recheck privileges inside the transaction", async () => {
  const a = await account("ADMIN"),
    b = await account("ADMIN");
  const results = await Promise.all([
    a.agent
      .patch("/api/admin/users/" + b.user.id)
      .set(headers)
      .send({ role: "USER" }),
    b.agent
      .patch("/api/admin/users/" + a.user.id)
      .set(headers)
      .send({ role: "USER" }),
  ]);
  assert.equal(results.filter((r) => r.status === 200).length, 1);
  assert.ok(results.some((r) => [401, 403].includes(r.status)));
  assert.equal(
    await db.user.count({
      where: {
        id: { in: [a.user.id, b.user.id] },
        role: "ADMIN",
        active: true,
      },
    }),
    1,
  );
});
test("dashboard shares grant read only; neither shares nor admin role grant dataset contents", async () => {
  const owner = await account(),
    recipient = await account(),
    stranger = await account("ADMIN");
  // Schema/access fixtures only; no teammate feature routes are implemented.
  const dataset = await db.dataset.create({
    data: {
      ownerId: owner.user.id,
      title: "Isolated fixture",
      currency: "GBP",
    },
  });
  const dashboard = await db.dashboard.create({
    data: {
      ownerId: owner.user.id,
      datasetId: dataset.id,
      title: "Fixture",
      config: { version: 1, filters: {}, charts: [], layout: [] },
    },
  });
  await db.dashboardShare.create({
    data: { dashboardId: dashboard.id, userId: recipient.user.id },
  });
  await requireDatasetAccess(dataset.id, owner.user.id);
  await assert.rejects(
    () => requireDatasetAccess(dataset.id, recipient.user.id),
    { status: 404 },
  );
  await assert.rejects(
    () => requireDatasetAccess(dataset.id, stranger.user.id),
    { status: 404 },
  );
  await requireDashboardAccess(dashboard.id, recipient.user.id);
  await assert.rejects(
    () => requireDashboardAccess(dashboard.id, recipient.user.id, true),
    { status: 404 },
  );
  await assert.rejects(
    () => requireDashboardAccess(dashboard.id, stranger.user.id),
    { status: 404 },
  );
  await db.dashboardShare.deleteMany({ where: { dashboardId: dashboard.id } });
  await assert.rejects(
    () => requireDashboardAccess(dashboard.id, recipient.user.id),
    { status: 404 },
  );
  await assert.rejects(() =>
    db.dashboard.create({
      data: {
        ownerId: recipient.user.id,
        datasetId: dataset.id,
        title: "Invalid owner",
        config: {},
      },
    }),
  );
  const listed = await stranger.agent.get("/api/admin/datasets").expect(200);
  const row = listed.body.data.find((d: { id: string }) => d.id === dataset.id);
  assert.ok(row);
  assert.equal("salesRecords" in row, false);
  assert.equal(row._count.salesRecords, 0);
  const summary = await stranger.agent.get("/api/admin/summary").expect(200);
  assert.ok(summary.body.data.datasets >= 1);
});
test("concurrent password change and old-password login cannot leave an old-password session alive", async () => {
  const { user, agent } = await account();
  const oldLogin = request.agent(app);
  const results = await Promise.all([
    agent
      .patch("/api/auth/password")
      .set(headers)
      .send({ currentPassword: password, newPassword: "ConcurrentPass123!" }),
    oldLogin
      .post("/api/auth/login")
      .set(headers)
      .send({ email: user.email, password }),
  ]);
  assert.equal(results[0].status, 204);
  assert.ok([200, 401].includes(results[1].status));
  await oldLogin.get("/api/auth/me").expect(401);
});
