import { z } from "zod";
import { pagination } from "./validation.js";
const timestamp = z.iso.datetime({ offset: true });
export const salesFilters = z
  .object({
    from: timestamp.optional(),
    to: timestamp.optional(),
    country: z.string().trim().min(1).max(200).optional(),
    productCode: z.string().trim().min(1).max(200).optional(),
  })
  .strict()
  .refine((v) => !v.from || !v.to || new Date(v.from) < new Date(v.to), {
    message: "from must precede to",
    path: ["to"],
  });
export const paginatedSalesFilters = pagination
  .extend(salesFilters.shape)
  .refine((v) => !v.from || !v.to || new Date(v.from) < new Date(v.to), {
    message: "from must precede to",
    path: ["to"],
  });
