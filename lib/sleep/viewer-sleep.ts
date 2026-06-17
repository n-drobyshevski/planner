// What counts as the viewer's OWN sleep, for the Sleep tab's derived nights.
//
// The Sleep tab reads the RAW both-members window (the insights filter drops
// inactive occurrences, which sleep needs), so this is the sole gate keeping a
// partner's blocks out of your derived timeline. It is deliberately STRICTER
// than lib/insights/filters.ts: that admits joint items (`isShared`), but a
// partner-owned shared/inactive block must never read as YOUR sleep — so we key
// strictly on ownership. A falsy viewerId (an unresolved current member) matches
// nothing, so an occurrence with an empty/missing ownerId can never sneak in.
//
// With a dedicated sleep category set, that category's timed events count;
// otherwise the historical inactive≡sleep heuristic applies.

import type { Occurrence } from "@/lib/types";

export function isViewerSleep(
  o: Occurrence,
  viewerId: string,
  sleepCategoryId: string | null,
): boolean {
  if (!viewerId) return false; // unresolved viewer → own nothing
  return (
    o.ownerId === viewerId &&
    !o.allDay &&
    o.kind === "event" &&
    (sleepCategoryId !== null ? o.categoryId === sleepCategoryId : o.inactive)
  );
}

/** The viewer's own sleep spans from a raw both-members occurrence list. */
export function selectViewerSleepSpans(
  occurrences: Occurrence[],
  viewerId: string,
  sleepCategoryId: string | null,
): Occurrence[] {
  return occurrences.filter((o) => isViewerSleep(o, viewerId, sleepCategoryId));
}
