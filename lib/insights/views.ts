// Saved-view config codec for the Insights views (pure, types-only imports).
//
// `insights_views.config` is a jsonb bag, so reads must survive rows written
// by older/newer clients. The schema is deliberately lenient: missing or
// junk optional fields fall back to defaults, but a config whose preset or
// granularity is unrecognizable is unusable (we'd render the wrong window)
// and parses to null — read/write asymmetry in the spirit of
// lib/attributes/schema.ts.

import { z } from "zod";
import type { PeriodPreset, Granularity } from "@/lib/insights/period";
import type { MemberFilter } from "@/lib/insights/filters";

export interface SavedViewConfig {
  preset: PeriodPreset;
  /** custom only: any ms within the first day of the range */
  customFrom?: number;
  /** custom only: any ms within the last (inclusive) day of the range */
  customTo?: number;
  granularity: Granularity;
  member: MemberFilter;
  hiddenCategoryIds: string[];
  includeInactive: boolean;
}

// Value lists for the imported union types. `satisfies` keeps each element
// honest; adding a union member without extending the list is caught by the
// exhaustiveness checks below.
const PRESETS = [
  "this-week",
  "last-week",
  "this-month",
  "last-30d",
  "last-90d",
  "custom",
] as const satisfies readonly PeriodPreset[];
const GRANULARITIES = ["day", "week", "month"] as const satisfies readonly Granularity[];
const MEMBER_FILTERS = ["me", "partner", "both"] as const satisfies readonly MemberFilter[];
// Exhaustiveness: a new union member that's missing from its list breaks these.
type _AllPresets = PeriodPreset extends (typeof PRESETS)[number] ? true : never;
type _AllGranularities = Granularity extends (typeof GRANULARITIES)[number] ? true : never;
type _AllMembers = MemberFilter extends (typeof MEMBER_FILTERS)[number] ? true : never;
const _exhaustive: [_AllPresets, _AllGranularities, _AllMembers] = [true, true, true];
void _exhaustive;

const configSchema = z.object({
  // Strict: an unknown preset/granularity makes the whole config unusable.
  preset: z.enum(PRESETS),
  granularity: z.enum(GRANULARITIES),
  // Lenient: junk values degrade to the default instead of losing the view.
  customFrom: z.number().finite().optional().catch(undefined),
  customTo: z.number().finite().optional().catch(undefined),
  member: z.enum(MEMBER_FILTERS).default("both").catch("both"),
  hiddenCategoryIds: z.array(z.string()).default([]).catch([]),
  includeInactive: z.boolean().default(false).catch(false),
});

/**
 * Lenient READ of a saved-view config: null when unusable (non-object, or an
 * unknown preset/granularity); missing/junk optional fields take defaults
 * (member "both", hidden [], includeInactive false).
 */
export function parseViewConfig(raw: unknown): SavedViewConfig | null {
  const result = configSchema.safeParse(raw);
  if (!result.success) return null;
  const c = result.data;
  const out: SavedViewConfig = {
    preset: c.preset,
    granularity: c.granularity,
    member: c.member,
    hiddenCategoryIds: c.hiddenCategoryIds,
    includeInactive: c.includeInactive,
  };
  if (c.preset === "custom") {
    if (c.customFrom != null) out.customFrom = c.customFrom;
    if (c.customTo != null) out.customTo = c.customTo;
  }
  return out;
}

/**
 * WRITE-side normalizer: a plain JSON-safe object ready for the jsonb column.
 * Strips the custom range fields when preset !== "custom" and never carries
 * `undefined` keys (JSON.stringify would drop them anyway; this keeps the
 * stored row canonical).
 */
export function encodeViewConfig(c: SavedViewConfig): SavedViewConfig {
  const out: SavedViewConfig = {
    preset: c.preset,
    granularity: c.granularity,
    member: c.member,
    hiddenCategoryIds: [...c.hiddenCategoryIds],
    includeInactive: c.includeInactive,
  };
  if (c.preset === "custom") {
    if (c.customFrom != null) out.customFrom = c.customFrom;
    if (c.customTo != null) out.customTo = c.customTo;
  }
  return out;
}
