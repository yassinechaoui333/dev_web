import test, { after } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { randomUUID } from "node:crypto";
import { app } from "../src/app.js";
import { db } from "../src/db.js";
import { config } from "../src/config.js";
if (process.env.NODE_ENV === "production")
  throw new Error("Tests cannot run in production");
const origin = { Origin: config.origin, "X-Requested-With": "SalesPlatform" };
const emails: string[] = [];
after(async () => {
  await db.activity.deleteMany({ where: { actor: { email: { in: emails } } } });
  await db.user.deleteMany({ where: { email: { in: emails } } });
  await db.$disconnect();
});
test("session authentication, validation, origin protection and logout", async () => {
  await request(app).get("/api/auth/me").expect(401);
  await request(app).get("/api/health").expect(200);
  const email = "test-" + randomUUID() + "@example.test";
  emails.push(email);
  const agent = request.agent(app);
  await agent
    .post("/api/auth/register")
    .set(origin)
    .send({
      email,
      name: "Test Analyst",
      password: "TestPassword123!",
      role: "ADMIN",
    })
    .expect(400);
  await agent
    .post("/api/auth/register")
    .send({ email, name: "Test Analyst", password: "TestPassword123!" })
    .expect(403);
  const registered = await agent
    .post("/api/auth/register")
    .set(origin)
    .send({ email, name: "Test Analyst", password: "TestPassword123!" })
    .expect(201);
  assert.equal(registered.body.data.role, "USER");
  assert.equal(registered.body.data.passwordHash, undefined);
  assert.match(registered.headers["set-cookie"][0], /HttpOnly/);
  assert.match(registered.headers["set-cookie"][0], /SameSite=Lax/);
  await agent.get("/api/auth/me").expect(200);
  await agent.post("/api/auth/logout").set(origin).expect(204);
  await agent.get("/api/auth/me").expect(401);
  await agent
    .post("/api/auth/login")
    .set(origin)
    .send({ email, password: "wrong" })
    .expect(401);
  await agent
    .post("/api/auth/login")
    .set(origin)
    .send({ email, password: "TestPassword123!" })
    .expect(200);
  const session = await db.session.findFirstOrThrow({
    where: { user: { email } },
  });
  assert.equal(session.tokenHash.length, 64);
  assert.notEqual(
    session.tokenHash,
    registered.headers["set-cookie"][0].split(";")[0].split("=")[1],
  );
  await db.session.update({
    where: { id: session.id },
    data: { expiresAt: new Date(0) },
  });
  await agent.get("/api/auth/me").expect(401);
});
