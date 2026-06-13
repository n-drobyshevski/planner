// Direct-overlap ("clash") detection for one day's packed timed items.
//
// packDay() decides how overlapping intervals share the horizontal axis. This
// module answers a different question over the SAME inputs: for each item, over
// what vertical (time) range does it sit in front of a block packed to its left
// — i.e. where does it visibly double-book another event? The calendar draws a
// whisper-weight hairline "seam" over that range so an overlap reads as a clash,
// not just two adjacent events.
//
// Pairs are matched by DIRECT time overlap (half-open [start, end)), NOT by
// packDay's transitive cluster membership: A 9–10 and C 10:15–11 share a cluster
// via B 9:30–10:30 but never overlap, so they never clash.

import type { LayoutInterval, PackedColumn } from "./pack-day";

/** Time range (epoch ms) over which an item overlaps a block to its left. */
export interface ClashRange {
  start: number;
  end: number;
}

// Overlapping items always get distinct columns (so distinct leftPct), but
// compare with a hair of slack so float noise never makes a real left-neighbour
// register as "equal" and get skipped.
const LEFT_EPS = 1e-6;

function overlaps(a: LayoutInterval, b: LayoutInterval): boolean {
  return a.start < b.end && b.start < a.end;
}

/**
 * For each input interval, the union time-range over which it overlaps any item
 * packed to its left (strictly smaller `leftPct`), or `null` when it is
 * clash-free. The result is aligned to the input index (`result[i]` ↔
 * `intervals[i]`); `packed` MUST be the `packDay()` output for the same
 * `intervals` array.
 *
 * Marking only the right-positioned block of each overlapping pair yields one
 * seam per boundary, drawn exactly where the front block covers the one behind.
 */
export function clashRanges(
  intervals: LayoutInterval[],
  packed: PackedColumn[],
): (ClashRange | null)[] {
  return intervals.map((it, i) => {
    let start = Infinity;
    let end = -Infinity;
    for (let j = 0; j < intervals.length; j++) {
      if (j === i) continue;
      // Only blocks to my left (behind me in the cascade / an earlier lane).
      if (packed[j].leftPct >= packed[i].leftPct - LEFT_EPS) continue;
      const other = intervals[j];
      if (!overlaps(it, other)) continue;
      start = Math.min(start, Math.max(it.start, other.start));
      end = Math.max(end, Math.min(it.end, other.end));
    }
    return start < end ? { start, end } : null;
  });
}
