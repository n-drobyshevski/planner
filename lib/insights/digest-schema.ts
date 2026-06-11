// The digest's response contract — shared by the API route (structured
// outputs + validation), the cache read (stored jsonb is re-validated, junk
// regenerates), and the card UI (a typed shape to render).

import { z } from "zod";

export const digestSchema = z.object({
  /** 2–4 sentence narrative of the period, grounded in the payload numbers. */
  summary: z.string().min(1).max(600),
  /** What stands out in the data — meaning first, numbers in support. */
  observations: z
    .array(
      z.object({
        headline: z.string().min(1).max(120),
        detail: z.string().min(1).max(300),
      }),
    )
    .min(2)
    .max(3),
  /** Concrete next steps, each with the reasoning that earns it. */
  recommendations: z
    .array(
      z.object({
        action: z.string().min(1).max(120),
        rationale: z.string().min(1).max(300),
      }),
    )
    .min(2)
    .max(3),
});

export type Digest = z.infer<typeof digestSchema>;
