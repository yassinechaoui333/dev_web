import { z } from "zod";
export const uuid = z.uuid();
export const pagination = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict();
export function pageMeta(page: number, pageSize: number, total: number) {
  return { page, pageSize, total, totalPages: Math.ceil(total / pageSize) };
}
export const email = z.string().trim().toLowerCase().pipe(z.email().max(254));
export const password = z.string().min(12).max(128);
export const name = z.string().trim().min(1).max(100);
