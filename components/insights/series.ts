// Shared display helpers for the insights tabs: series key → name/color, and
// bucket → axis/tooltip labels. Client-only (palette mapping), but pure.

import { format } from "date-fns";
import { tz } from "@date-fns/tz";
import { OTHER_SERIES, UNCATEGORIZED_SERIES } from "@/lib/analytics/trends";
import { dateFnsLocale } from "@/lib/datetime/date-locale";
import { toPaletteColor } from "@/lib/theme/appearance";
import type { Bucket, Granularity } from "@/lib/insights/period";
import type { Category } from "@/lib/types";

/** Neutral fill for uncategorized / "Other" slices and tracks. */
export const NEUTRAL = "var(--muted-foreground)";

export interface SeriesMeta {
  name: string;
  color: string;
}

/**
 * Localized fallback names for the synthetic series keys (no real category to
 * read a name from). Pure: callers pass them resolved from `useTranslations`
 * so this module stays free of React. Defaults to English when omitted.
 */
export interface SeriesFallbackLabels {
  other: string;
  noContext: string;
  unknown: string;
}

const DEFAULT_SERIES_LABELS: SeriesFallbackLabels = {
  other: "Other",
  noContext: "No context",
  unknown: "Unknown",
};

/** Build fallback labels from an `insights` namespace translator. */
export function seriesFallbackLabels(
  t: (key: string) => string,
): SeriesFallbackLabels {
  return {
    other: t("series.other"),
    noContext: t("series.noContext"),
    unknown: t("series.unknown"),
  };
}

/** Resolve a categoryTrends/categoryByBucket series key for display. */
export function seriesMeta(
  key: string,
  categories: Map<string, Category>,
  labels: SeriesFallbackLabels = DEFAULT_SERIES_LABELS,
): SeriesMeta {
  if (key === OTHER_SERIES) return { name: labels.other, color: NEUTRAL };
  if (key === UNCATEGORIZED_SERIES) return { name: labels.noContext, color: NEUTRAL };
  const cat = categories.get(key);
  return {
    name: cat?.name ?? labels.unknown,
    color: cat ? (toPaletteColor(cat.color) ?? NEUTRAL) : NEUTRAL,
  };
}

/** Short axis tick for a bucket start: "8" (day) · "8 Jun" (week) · "Jun" (month). */
export function bucketTick(
  startMs: number,
  granularity: Granularity,
  timeZone: string,
  locale?: string,
): string {
  const ctx = tz(timeZone);
  const lc = dateFnsLocale(locale ?? "en");
  if (granularity === "day") return format(startMs, "d", { in: ctx, locale: lc });
  if (granularity === "week") return format(startMs, "d MMM", { in: ctx, locale: lc });
  return format(startMs, "MMM", { in: ctx, locale: lc });
}

/** Full tooltip label: "Mon, 8 Jun" · "8 – 14 Jun 2026" · "June 2026". */
export function bucketLabel(
  bucket: Bucket,
  granularity: Granularity,
  timeZone: string,
  locale?: string,
): string {
  const ctx = tz(timeZone);
  const lc = dateFnsLocale(locale ?? "en");
  if (granularity === "day") return format(bucket.start, "EEE, d MMM", { in: ctx, locale: lc });
  if (granularity === "month") return format(bucket.start, "MMMM yyyy", { in: ctx, locale: lc });
  const last = bucket.end - 1;
  const sameMonth =
    format(bucket.start, "MMM yyyy", { in: ctx, locale: lc }) ===
    format(last, "MMM yyyy", { in: ctx, locale: lc });
  const left = sameMonth
    ? format(bucket.start, "d", { in: ctx, locale: lc })
    : format(bucket.start, "d MMM", { in: ctx, locale: lc });
  return `${left} – ${format(last, "d MMM yyyy", { in: ctx, locale: lc })}`;
}
