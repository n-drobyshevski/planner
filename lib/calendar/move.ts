// Pure time math for dragging a whole event around the week/day grid.
//
// Coordinates are "grid minutes" measured from the first visible column's local
// midnight (`days[0]`). Column i spans [i*1440, (i+1)*1440). Because every
// column is exactly DAY_MS apart and SLOT_MIN divides 1440 evenly, snapping is
// uniform across columns and a value can be split back into (day, minute)
// trivially. Working this way — rather than minutes-of-day pinned to the start
// column — is what lets an event whose body crosses midnight (sleep) move as one
// rigid piece and be dropped at night. The old logic clamped the start into a
// single day (`1440 - duration`), which made a night placement impossible.

import { snapMinutes, SLOT_MIN } from "@/lib/datetime/grid-math";

const DAY_MIN = 1440;
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

export interface GridSeg {
  dayIndex: number;
  topMin: number;
  heightMin: number;
}

/**
 * New event start (grid-minutes) for a move drag: the snapped pointer position
 * minus the offset at which the event was grabbed, kept on a visible column.
 * Duration is irrelevant to the clamp now — the event may legitimately spill
 * past midnight off the bottom of its column.
 */
export function movedStartTotal(
  pointerTotalMin: number,
  grabOffsetMin: number,
  dayCount: number,
): number {
  const maxStart = dayCount * DAY_MIN - SLOT_MIN;
  return clamp(snapMinutes(pointerTotalMin - grabOffsetMin), 0, maxStart);
}

/**
 * Split a placed block into its per-column preview segments — one if it fits in
 * a day, two when it crosses midnight — each clipped to its column so a preview
 * ghost never overflows the grid. Segments past the last visible column are
 * dropped.
 */
export function previewSegments(
  startTotalMin: number,
  durationMin: number,
  dayCount: number,
): GridSeg[] {
  const segs: GridSeg[] = [];
  const endTotal = startTotalMin + durationMin;
  let cursor = startTotalMin;
  while (cursor < endTotal) {
    const dayIndex = Math.floor(cursor / DAY_MIN);
    if (dayIndex >= dayCount) break;
    const segEnd = Math.min(endTotal, (dayIndex + 1) * DAY_MIN);
    segs.push({
      dayIndex,
      topMin: cursor - dayIndex * DAY_MIN,
      heightMin: segEnd - cursor,
    });
    cursor = segEnd;
  }
  return segs;
}

/** Shift a group member's start by the same grid-minute delta as the grabbed
 *  block, kept on a visible column. Returns the member's new start in grid-min. */
export function shiftedMemberStart(
  memberStartTotalMin: number,
  deltaTotalMin: number,
  dayCount: number,
): number {
  return clamp(memberStartTotalMin + deltaTotalMin, 0, dayCount * DAY_MIN - SLOT_MIN);
}
