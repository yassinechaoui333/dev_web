import {
  createHash,
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";
import type { RequestHandler } from "express";
import type { Prisma } from "@prisma/client";
import { db } from "../db.js";
import { config } from "../config.js";
import { ApiError } from "./errors.js";
const scrypt = promisify(scryptCallback);
export const publicUser = {
  id: true,
  email: true,
  name: true,
  role: true,
  active: true,
  createdAt: true,
  updatedAt: true,
} as const;
export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const hash = (await scrypt(password, salt, 64)) as Buffer;
  return salt + ":" + hash.toString("hex");
}
export async function verifyPassword(password: string, encoded: string) {
  const [salt, hex] = encoded.split(":");
  const hash = (await scrypt(password, salt, 64)) as Buffer;
  const expected = Buffer.from(hex, "hex");
  return expected.length === hash.length && timingSafeEqual(expected, hash);
}
export const tokenHash = (token: string) =>
  createHash("sha256").update(token).digest("hex");
export const cookieOptions = {
  httpOnly: true,
  secure: config.production,
  sameSite: "lax" as const,
  path: "/",
};
export async function createSession(
  tx: Prisma.TransactionClient,
  userId: string,
  oldToken?: unknown,
) {
  const token = randomBytes(32).toString("base64url");
  if (typeof oldToken === "string")
    await tx.session.deleteMany({ where: { tokenHash: tokenHash(oldToken) } });
  await tx.session.create({
    data: {
      userId,
      tokenHash: tokenHash(token),
      expiresAt: new Date(Date.now() + config.sessionMs),
    },
  });
  return token;
}
export function setSessionCookie(
  token: string,
  res: Parameters<RequestHandler>[1],
) {
  res.cookie(config.cookieName, token, {
    ...cookieOptions,
    maxAge: config.sessionMs,
  });
}
export const authenticate: RequestHandler = async (req, res, next) => {
  const token = req.cookies[config.cookieName];
  if (typeof token !== "string")
    throw new ApiError(401, "UNAUTHENTICATED", "Please sign in");
  const session = await db.session.findUnique({
    where: { tokenHash: tokenHash(token) },
    include: { user: { select: publicUser } },
  });
  if (!session || session.expiresAt <= new Date() || !session.user.active) {
    res.clearCookie(config.cookieName, cookieOptions);
    throw new ApiError(
      401,
      "UNAUTHENTICATED",
      "Session expired or unavailable",
    );
  }
  res.locals.user = session.user;
  res.locals.sessionId = session.id;
  next();
};
export const requireAdmin: RequestHandler = (_req, res, next) => {
  if (res.locals.user?.role !== "ADMIN")
    throw new ApiError(403, "FORBIDDEN", "Administrator access required");
  next();
};
export const csrfGuard: RequestHandler = (req, _res, next) => {
  if (
    !["GET", "HEAD", "OPTIONS"].includes(req.method) &&
    (req.get("origin") !== config.origin ||
      req.get("x-requested-with") !== "SalesPlatform")
  ) {
    throw new ApiError(
      403,
      "CSRF_REJECTED",
      "Request origin or CSRF header is invalid",
    );
  }
  next();
};
