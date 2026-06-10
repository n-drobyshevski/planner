// Shared display helpers for the insights tabs: series key → name/color, and
// bucket → axis/tooltip labels. Client-only (palette mapping), but pure.

import { format } from "date-fns";
import { tz } from "@date-fns/tz";
import { OTHER_SERIES, UNCATEGORIZED_SERIES } from "@/lib/analytics/trends";
import { toPaletteColor } from "@/lib/theme/appearance";
import type { Bucket, Granularity } from "@/lib/insights/period";
import type { Category } from "@/lib/types";

/** Neutral fill for uncategorized / "Other" slices and tracks. */
export const NEUTRAL = "var(--muted-foreground)";

export interface SeriesMeta {
  name: string;
  color: string;
}

/** Resolve a categoryTrends/categoryByBucket series key for display. */
export function seriesMeta(
  key: string,
  categories: Map<string, Category>,
): SeriesMeta {
  if (key === OTHER_SERIES) return { name: "Other", color: NEUTRAL };
  if (key === UNCATEGORIZED_SERIES) return { name: "No context", color: NEUTRAL };
  const cat = categories.get(key);
  return {
    name: cat?.name ?? "Unknown",
    color: cat ? (toPaletteColor(cat.color) ?? NEUTRAL) : NEUTRAL,
  };
}

/** Short axis tick for a bucket start: "8" (day) · "8 Jun" (week) · "Jun" (month). */
export function bucketTick(
  startMs: number,
  granularity: Granularity,
  timeZone: string,
): string {
  const ctx = tz(timeZone);
  if (granularity === "day") return format(startMs, "d", { in: ctx });
  if (granularity === "week") return format(startMs, "d MMM", { in: ctx });
  return format(startMs, "MMM", { in: ctx });
}

/** Full tooltip label: "Mon, 8 Jun" · "8 – 14 Jun 2026" · "June 2026". */
export function bucketLabel(
  bucket: Bucket,
  granularity: Granularity,
  timeZone: string,
): string {
  const ctx = tz(timeZone);
  if (granularity === "day") return format(bucket.start, "EEE, d MMM", { in: ctx });
  if (granularity === "month") return format(bucket.start, "MMMM yyyy", { in: ctx });
  const last = bucket.end - 1;
  const sameMonth =
    format(bucket.start, "MMM yyyy", { in: ctx }) === format(last, "MMM yyyy", { in: ctx });
  const left = sameMonth
    ? format(bucket.start, "d", { in: ctx })
    : format(bucket.start, "d MMM", { in: ctx });
  return `${left} – ${format(last, "d MMM yyyy", { in: ctx })}`;
}
