// Pure derivation of the Unified Inbox's "needs your attention" rows. No table:
// every item is derived from the same workspace data the rest of the app already
// holds — recently-finished events and tasks lacking a satisfaction rating, and
// recent mornings without a sleep log. Conventions mirror lib/analytics/*: epoch
// ms, half-open [start, end) intervals, calendar-day math in an explicit IANA
// zone (DST-correct via TZDate).
//
// Translator-free on purpose: each row carries raw entity text (titleText) or a
// date token, and the component builds the visible frame from the `inbox`
// message namespace. That keeps this module trivially unit-testable without a
// translator, the same split AttributeFields uses (ATTRIBUTE_META stays
// language-free; the form localizes).
//
// Phase 4 extends InboxItem with a request-approval row (a `request` kind) — a
// non-breaking addition to the union; nothing here needs to change for it.

import { TZDate } from "@date-fns/tz";

import { dateKeyInZone, dayStartOffset } from "@/lib/datetime/local";
import type { ItemAttributes } from "@/lib/attributes/schema";
import type { Occurrence, TaskRow, TimeslotRequestRow } from "@/lib/types";

const DAY = 86_400_000;

/** Ratings stay fresh: only surface the last few days so the inbox never becomes
 *  a backlog of stale "rate this" prompts. */
export const RATE_N = 3;
/** Sleep backfill tolerates a week — logging last night's sleep a few days late
 *  is still useful. */
export const SLEEP_N = 7;
/** Soft cap so a long-neglected workspace can't render an unbounded list. */
export const INBOX_CAP = 50;

export type InboxItemKind = "rate-event" | "rate-task" | "log-sleep" | "request";

interface InboxItemBase {
  /** Stable across recomputes: `${kind}:${entityKey}` — also the React key and
   *  the dedup identity. */
  id: string;
  /** "attention" sorts above "info". All current kinds are calm "info"; the
   *  field exists so Phase 4 request rows (and any future urgent nudge) can
   *  lift to the top without a structural change. */
  severity: "attention" | "info";
  /** The instant this item is anchored to; newest first within a severity. */
  sortMs: number;
}

export interface RateEventItem extends InboxItemBase {
  kind: "rate-event";
  /** EventRow id — the satisfaction write target (updateSingle). */
  eventId: string;
  /** Raw event title; the component localizes the surrounding frame. */
  titleText: string;
  /** The event's current attribute bag — the write merges satisfaction into it
   *  (setAttribute) so existing energy/focus/flexibility survive. */
  attributes: ItemAttributes;
}

export interface RateTaskItem extends InboxItemBase {
  kind: "rate-task";
  /** TaskRow id — the satisfaction write target. */
  taskId: string;
  titleText: string;
  /** The task's current attribute bag (see RateEventItem.attributes). */
  attributes: ItemAttributes;
}

export interface LogSleepItem extends InboxItemBase {
  kind: "log-sleep";
  /** Wake-day calendar token "yyyy-MM-dd" — the sleep-log upsert key + display. */
  dateKey: string;
}

/**
 * A pending timeslot request from a public share viewer (Phase 4). The owner
 * approves (→ creates an event at the proposed time) or declines. Always
 * "attention" severity so it floats above the calm rating/sleep nudges.
 */
export interface RequestItem extends InboxItemBase {
  kind: "request";
  /** timeslot_requests row id — the approve/decline write target. */
  requestId: string;
  /** free-text name the requester gave, or null (anonymous). */
  requesterName: string | null;
  message: string | null;
  proposedStart: number; // epoch ms
  proposedEnd: number; // epoch ms
}

/** The discriminated union of inbox rows. */
export type InboxItem = RateEventItem | RateTaskItem | LogSleepItem | RequestItem;

export interface InboxInput {
  /** Occurrences over a trailing window (raw — both members'; we filter to the
   *  viewer's own). */
  occurrences: Occurrence[];
  /** Workspace tasks (top-level + subtasks; we filter). */
  tasks: TaskRow[];
  /** Wake-date tokens ("yyyy-MM-dd") that already have a sleep-log row for the
   *  viewer — sleep logs are member-private, so this is the viewer's set. */
  sleepLogDates: ReadonlySet<string>;
  /** Pending public-share timeslot requests addressed to the viewer (RLS-scoped
   *  to the owner). Optional so existing callers/tests need no change. */
  requests?: TimeslotRequestRow[];
  /** The current member — only their own items are surfaced (never the partner's). */
  viewerId: string;
  now: number;
  timeZone: string;
  /** Viewer-zone night window (MemberSleepPrefs); used to keep today's sleep
   *  nudge hidden until the morning is actually over. */
  nightWindow: { startHour: number; endHour: number };
  /** Trailing windows, overridable for tests. */
  rateWindowDays?: number;
  sleepWindowDays?: number;
}

/** A timed, active, non-context calendar block that can carry a satisfaction
 *  rating. Sleep/inactive blocks, all-day spans, cancelled instances and
 *  context paint-blocks are never rated. */
function isRatableOccurrence(o: Occurrence): boolean {
  return (
    o.kind === "event" && !o.inactive && !o.allDay && o.status !== "cancelled"
  );
}

/**
 * Derive the inbox rows from already-fetched workspace data. Pure: no I/O, no
 * clock read (callers pass `now`). Sorted attention-first then newest, capped.
 */
export function deriveInboxItems(input: InboxInput): InboxItem[] {
  const { occurrences, tasks, sleepLogDates, viewerId, now, timeZone, nightWindow } =
    input;
  const rateN = input.rateWindowDays ?? RATE_N;
  const sleepN = input.sleepWindowDays ?? SLEEP_N;
  const rateCutoff = now - rateN * DAY;

  const items: InboxItem[] = [];

  // --- request: pending public-share timeslot proposals (attention, top) ------
  for (const r of input.requests ?? []) {
    items.push({
      id: `request:${r.id}`,
      kind: "request",
      severity: "attention",
      sortMs: r.createdAt,
      requestId: r.id,
      requesterName: r.requesterName,
      message: r.message,
      proposedStart: r.proposedStart,
      proposedEnd: r.proposedEnd,
    });
  }

  // --- rate-event: the viewer's own finished, unrated, non-recurring blocks ---
  for (const o of occurrences) {
    if (o.ownerId !== viewerId) continue;
    if (!isRatableOccurrence(o)) continue;
    // v1: a per-occurrence rating would write the SERIES master row, rating
    // every instance. Skip recurring until an override write path exists.
    if (o.isRecurring) continue;
    if (o.attributes.satisfaction !== undefined) continue;
    if (!(o.end < now && o.end >= rateCutoff)) continue;
    items.push({
      id: `rate-event:${o.key}`,
      kind: "rate-event",
      severity: "info",
      sortMs: o.end,
      eventId: o.eventId,
      titleText: o.title,
      attributes: o.attributes,
    });
  }

  // --- rate-task: top-level tasks the viewer finished, still unrated ----------
  for (const tk of tasks) {
    if (tk.parentId !== null) continue; // subtasks never count
    if (tk.completedAt === null) continue;
    if (!(tk.completedAt < now && tk.completedAt >= rateCutoff)) continue;
    if (tk.attributes.satisfaction !== undefined) continue;
    // The person who did it rates it; fall back to the owner when unassigned.
    const doneByViewer =
      tk.assigneeId === viewerId ||
      (tk.assigneeId === null && tk.ownerId === viewerId);
    if (!doneByViewer) continue;
    items.push({
      id: `rate-task:${tk.id}`,
      kind: "rate-task",
      severity: "info",
      sortMs: tk.completedAt,
      taskId: tk.id,
      titleText: tk.title,
      attributes: tk.attributes,
    });
  }

  // --- log-sleep: recent mornings with no sleep-log row -----------------------
  // Walk back over the trailing SLEEP_N days (today included). Today is surfaced
  // only once its wake-window end has passed — before then the night isn't over,
  // so there's nothing to log yet.
  const todayKey = dateKeyInZone(now, timeZone);
  for (let back = 0; back < sleepN; back++) {
    const dayStartMs = dayStartOffset(now, -back, timeZone);
    const dateKey = dateKeyInZone(dayStartMs, timeZone);
    if (sleepLogDates.has(dateKey)) continue;
    if (dateKey === todayKey) {
      const [y, mo, d] = dateKey.split("-").map(Number);
      const wakeEnd = new TZDate(
        y,
        mo - 1,
        d,
        nightWindow.endHour,
        0,
        0,
        timeZone,
      ).getTime();
      if (now < wakeEnd) continue;
    }
    items.push({
      id: `log-sleep:${dateKey}`,
      kind: "log-sleep",
      severity: "info",
      sortMs: dayStartMs,
      dateKey,
    });
  }

  items.sort((a, b) => {
    if (a.severity !== b.severity) return a.severity === "attention" ? -1 : 1;
    return b.sortMs - a.sortMs; // newest first
  });
  return items.slice(0, INBOX_CAP);
}
