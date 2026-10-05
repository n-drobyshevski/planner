// The .ics import review's rules: which events a name / date filter keeps,
// which already exist in Planr, and which start selected. Pure; the Android
// port (:core:ical IcsReview) replays these cases from the shared fixtures.

import type { IcsEvent } from "./parse";
import { wallToInstant } from "./zone";

const DAY = 86_400_000;

/** A compiled name filter, or why the pattern can't be used. */
export type NameFilter = { ok: true; test: (title: string) => boolean } | { ok: false; error: "invalid-regex" };

/**
 * The review's name filter. Empty matches everything; `/…/` is a regular
 * expression; a pattern with `*` or `?` is a glob; anything else is a plain
 * substring. All case-insensitive, and all match anywhere in the title.
 */
export function compileNameFilter(pattern: string): NameFilter {
  const p = pattern.trim();
  if (p === "") return { ok: true, test: () => true };
  if (p.length >= 2 && p.startsWith("/") && p.endsWith("/")) {
    try {
      const re = new RegExp(p.slice(1, -1), "i");
      return { ok: true, test: (title) => re.test(title) };
    } catch {
      return { ok: false, error: "invalid-regex" };
    }
  }
  if (p.includes("*") || p.includes("?")) {
    const body = p
      .split("")
      .map((c) => (c === "*" ? ".*" : c === "?" ? "." : c.replace(/[.+^${}()|[\]\\]/g, "\\$&")))
      .join("");
    const re = new RegExp(body, "i");
    return { ok: true, test: (title) => re.test(title) };
  }
  const needle = p.toLowerCase();
  return { ok: true, test: (title) => title.toLowerCase().includes(needle) };
}

/** An inclusive range of local days ("yyyy-MM-dd"); either end may be open. */
export interface DayRange {
  from: string | null;
  to: string | null;
}

function dayStart(date: string, zone: string): number {
  const [y, m, d] = date.split("-").map(Number);
  return wallToInstant(zone, y, m, d);
}

/**
 * Whether [event] has something inside [range] in the viewer's [zone]. A
 * series counts from its first start to its UNTIL (open-ended and COUNT
 * series run on); all-day events are compared on their floating dates.
 */
export function inRange(event: IcsEvent, range: DayRange, zone: string): boolean {
  const toFloating = (date: string) => {
    const [y, m, d] = date.split("-").map(Number);
    return Date.UTC(y, m - 1, d);
  };
  const lower = range.from ? (event.allDay ? toFloating(range.from) : dayStart(range.from, zone)) : -Infinity;
  const upper = range.to ? (event.allDay ? toFloating(range.to) + DAY : nextDayStart(range.to, zone)) : Infinity;
  const lastEnd = event.rrule
    ? event.recurrenceEndsAt === null
      ? Infinity
      : event.recurrenceEndsAt + (event.end - event.start)
    : event.end;
  // Half-open overlap; a zero-length event counts on its start.
  const endsAfter = lastEnd > lower || (lastEnd === event.start && event.start >= lower);
  return event.start < upper && endsAfter;
}

function nextDayStart(date: string, zone: string): number {
  const [y, m, d] = date.split("-").map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + 1));
  return wallToInstant(zone, next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate());
}

/** An event already in Planr, as duplicate detection sees it. */
export interface ExistingEvent {
  icalUid: string | null;
  title: string;
  start: number;
  end: number;
}

function normalizeTitle(title: string): string {
  return title.trim().replace(/\s+/g, " ").toLowerCase();
}

/** True when [event] is already in Planr: the same UID, or the same title, start and end. */
export function isDuplicate(event: IcsEvent, existing: readonly ExistingEvent[]): boolean {
  const title = normalizeTitle(event.title);
  return existing.some(
    (e) =>
      (event.uid !== null && e.icalUid === event.uid) ||
      (e.start === event.start && e.end === event.end && normalizeTitle(e.title) === title),
  );
}

/**
 * Whether [event] starts ticked: not a duplicate, not cancelled in the
 * file, and not entirely in the past at [now].
 */
export function selectedByDefault(event: IcsEvent, duplicate: boolean, now: number): boolean {
  if (duplicate || event.cancelled) return false;
  const lastEnd = event.rrule ? (event.recurrenceEndsAt === null ? Infinity : event.recurrenceEndsAt + (event.end - event.start)) : event.end;
  return lastEnd > now;
}
