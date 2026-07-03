import { z } from "zod";

// Epoch-ms bounds (2000-01-01 .. 2100-01-01): generous for any real calendar,
// and well inside the JS Date range — an unbounded int like 9e15 would make
// `new Date(...).toISOString()` in the route throw a RangeError (an uncaught
// 500) instead of the clean 400 the schema produces.
const MIN_EPOCH_MS = Date.UTC(2000, 0, 1);
const MAX_EPOCH_MS = Date.UTC(2100, 0, 1);

// Lives outside route.ts because Next restricts route-file exports; the unit
// tests import it directly.
export const bodySchema = z
  .object({
    name: z.string().trim().max(120).optional(),
    message: z.string().trim().max(1000).optional(),
    start: z.number().int().min(MIN_EPOCH_MS).max(MAX_EPOCH_MS),
    end: z.number().int().min(MIN_EPOCH_MS).max(MAX_EPOCH_MS),
  })
  .refine((b) => b.end > b.start, { message: "end must be after start" });
