// Time bands (pure). Epoch milliseconds; intervals are half-open [start, end).
//
// Used by the public share view to collapse many overlapping inactive (sleep /
// blocked) occurrences into the minimal set of shaded "Unavailable" regions, so the
// day column draws one calm band per stretch instead of stacked slabs.

import type { Occurrence } from "@/lib/types";

export interface TimeRange {
  start: number;
  end: number;
}

/**
 * Merge overlapping or touching ranges into the minimal sorted set. Zero/negative
 * ranges are dropped; adjacency (`end === next.start`) merges so abutting blocks
 * read as one continuous band. Input is not mutated.
 */
export function mergeRanges(ranges: TimeRange[]): TimeRange[] {
  const sorted = ranges
    .filter((r) => r.end > r.start)
    .sort((a, b) => a.start - b.start);
  const out: TimeRange[] = [];
  for (const r of sorted) {
    const last = out[out.length - 1];
    if (last && r.start <= last.end) {
      last.end = Math.max(last.end, r.end);
    } else {
      out.push({ start: r.start, end: r.end });
    }
  }
  return out;
}

/**
 * Split the public share's expanded occurrences into the two things the calendar
 * needs: drawable occurrences (context backdrops + active event blocks) and the
 * merged "Unavailable" bands (inactive time, shown as place only, never content).
 *
 * - `kind === "context"` → always a drawable backdrop. Contexts are labelled zones,
 *   not busy holds, so they're never folded into a band; ContextBackdrop renders
 *   their own inactive / status styling. (Month view drops them downstream.)
 * - active events (`!inactive`) → drawable blocks.
 * - inactive, non-cancelled events → merged into `unavailableBands`.
 * - cancelled-inactive events → dropped (a cancelled hold isn't "unavailable").
 *
 * The RPC has already applied every privacy filter (private / hidden-from-public /
 * category allow-list / show_inactive) and busy/inactive redaction, so this is a
 * pure presentational split.
 */
export function partitionPublicOccurrences(all: Occurrence[]): {
  occurrences: Occurrence[];
  unavailableBands: TimeRange[];
} {
  const occurrences: Occurrence[] = [];
  const inactiveRanges: TimeRange[] = [];
  for (const o of all) {
    if (o.kind === "context") {
      occurrences.push(o);
    } else if (!o.inactive) {
      occurrences.push(o);
    } else if (o.status !== "cancelled") {
      inactiveRanges.push({ start: o.start, end: o.end });
    }
  }
  return { occurrences, unavailableBands: mergeRanges(inactiveRanges) };
}
