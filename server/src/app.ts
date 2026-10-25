import { datasetRouter } from "./modules/datasets/router.js";
import { analyticsRouter } from "./modules/analytics/router.js";
import { dashboardRouter } from "./modules/dashboards/router.js";
import { randomUUID } from "node:crypto";
import express from "express";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import { db } from "./db.js";
import { profileRouter } from "./modules/auth/profile.js";
import { adminRouter } from "./modules/admin/router.js";
import { authRouter } from "./modules/auth/router.js";
import { ApiError, errorHandler } from "./shared/errors.js";
import { csrfGuard } from "./shared/security.js";
export const app = express();
app.disable("x-powered-by");
app.use(helmet());
app.use((_req, res, next) => {
  res.locals.requestId = randomUUID();
  res.setHeader("X-Request-Id", res.locals.requestId);
  res.setHeader("Cache-Control", "no-store");
  next();
});
app.use(express.json({ limit: "32kb" }), cookieParser(), csrfGuard);
app.get("/api/health", async (_req, res) => {
  try {
    await db.$queryRaw`SELECT 1`;
    res.json({ data: { status: "ok", database: "up" } });
  } catch {
    throw new ApiError(503, "DATABASE_UNAVAILABLE", "Database unavailable");
  }
});
app.use("/api/datasets/:datasetId/analytics", analyticsRouter);
app.use("/api/datasets", datasetRouter);
app.use("/api/dashboards", dashboardRouter);
app.use("/api/auth", authRouter, profileRouter);
app.use("/api/admin", adminRouter);
app.use((_req, _res, next) =>
  next(new ApiError(404, "NOT_FOUND", "Endpoint not found")),
);
app.use(errorHandler);
