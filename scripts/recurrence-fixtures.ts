/**
 * Recurrence golden fixtures — the contract between the TypeScript recurrence
 * code (lib/recurrence/*) and its Kotlin port (android/core/recurrence).
 *
 * `buildRecurrenceFixtures()` runs the REAL web functions over a broad case set
 * and returns plain JSON; `scripts/export-recurrence-fixtures.ts` writes it to
 * android/core/recurrence/src/test/resources/recurrence-fixtures.json
 * (`pnpm fixtures:recurrence`), and test/recurrence-fixtures.test.ts regenerates
 * it in memory so any behavior drift on the web side fails CI. Pure and
 * deterministic: no clock reads, fixed ids, independent of the process TZ.
 *
 * ## JSON schema (version 1)
 *
 * Conventions:
 * - `Instant` = ISO-8601 UTC string with milliseconds, e.g. "2026-03-29T07:00:00.000Z"
 *   (JS `toISOString()`), used for every OUTPUT time.
 * - `PgTimestamp` = a timestamptz as PostgREST returns it, e.g.
 *   "2026-03-29T07:00:00+00:00", used for every INPUT row time (parse as an instant).
 * - Input rows are exactly the `events` / `event_overrides` table rows the client
 *   selects (snake_case). The TS side maps them with lib/supabase/mappers.ts
 *   (`mapEvent` / `mapOverride`) before calling the function under test.
 * - Outputs use the domain (camelCase) shape of lib/types.ts with times as `Instant`.
 * - Arrays are ordered; object key order is irrelevant.
 *
 * ```ts
 * type Root = {
 *   version: 1;
 *   generatedBy: "scripts/export-recurrence-fixtures.ts";
 *   expand: ExpandCase[];               // expandEvents(events, overrides, window, shared)
 *   overrideInputs: OverrideInputCase[]; // cancelOccurrence / modifyOccurrence
 *   editAll: EditAllCase[];             // editAll(event, patch)
 *   splitThisAndFuture: SplitCase[];    // splitThisAndFuture(event, from, patch)
 *   capThisAndFuture: CapCase[];        // capThisAndFuture(event, from) (deleteThisAndFuture's pure part)
 *   buildRRule: BuildRRuleCase[];       // buildRRule(form)
 *   parseRRule: ParseRRuleCase[];       // parseRRule(rrule)
 * };
 *
 * type EventDbRow = {
 *   id: string; workspace_id: string; owner_id: string; category_id: string | null;
 *   title: string; description: string | null; location: string | null;
 *   is_private: boolean; is_shared: boolean; hidden_from_public: boolean;
 *   color: string | null; kind: "event" | "context"; all_day: boolean;
 *   inactive: boolean; status: "cancelled" | "planned" | "confirmed";
 *   starts_at: PgTimestamp; ends_at: PgTimestamp; time_zone: string; // IANA
 *   rrule: string | null;               // RFC 5545 RRULE body, no "RRULE:" prefix, no DTSTART
 *   recurrence_ends_at: PgTimestamp | null;
 *   task_id: string | null; attributes: Record<string, unknown>;
 *   created_at: PgTimestamp; updated_at: PgTimestamp;
 * };
 * type OverrideDbRow = {
 *   id: string; workspace_id: string; event_id: string;
 *   occurrence_date: PgTimestamp;       // ORIGINAL occurrence start (the key)
 *   type: "cancel" | "modify";
 *   title: string | null; description: string | null; location: string | null;
 *   category_id: string | null; starts_at: PgTimestamp | null;
 *   ends_at: PgTimestamp | null; all_day: boolean | null;
 * };
 *
 * type ExpandCase = {
 *   name: string; description: string;
 *   input: {
 *     events: EventDbRow[]; overrides: OverrideDbRow[];
 *     window: { start: Instant; end: Instant };   // half-open [start, end)
 *     sharedCategoryIds: string[];                // ids of categories with owner_id IS NULL
 *   };
 *   expected: Occurrence[];   // in expandEvents' output order (see below)
 * };
 * type Occurrence = {
 *   key: string;              // single: event id; recurring: `${eventId}:${occurrenceDate epoch ms}`
 *   eventId: string; occurrenceDate: Instant; start: Instant; end: Instant;
 *   allDay: boolean; inactive: boolean; status: string; title: string;
 *   description: string | null; location: string | null; categoryId: string | null;
 *   color: string | null; kind: string; ownerId: string; isPrivate: boolean;
 *   isShared: boolean; hiddenFromPublic: boolean; taskId: string | null;
 *   attributes: Record<string, unknown>; isRecurring: boolean; isException: boolean;
 * };
 * // Order: start asc, then title (JS localeCompare), then key. Fixtures never tie
 * // on start with titles whose localeCompare differs from plain code-point order.
 *
 * type Patch = {               // OccurrencePatch; absent key = untouched, null = clear
 *   title?: string; description?: string | null; location?: string | null;
 *   categoryId?: string | null; start?: Instant; end?: Instant; allDay?: boolean;
 *   inactive?: boolean; status?: string;
 * };
 * type OverrideInputCase = {
 *   name: string; description: string;
 *   input: { op: "cancel" | "modify"; eventId: string; occurrenceDate: Instant; patch?: Patch };
 *   expected: { eventId: string; occurrenceDate: Instant; type: "cancel" | "modify"; patch?: Patch };
 * };
 * type EditAllCase = {
 *   name: string; description: string;
 *   input: { event: EventDbRow; patch: Patch };
 *   expected: Partial<{ title; description; location; categoryId; allDay; inactive;
 *                       status; start: Instant; end: Instant }>;  // only keys present are set
 * };
 * type SplitCase = {
 *   name: string; description: string;
 *   input: { event: EventDbRow; fromOccurrence: Instant; patch: Patch };
 *   expected: {
 *     original: { id: string; rrule: string | null; recurrenceEndsAt: Instant | null };
 *     newSeries: { workspaceId; ownerId; categoryId; title; description; location;
 *       isPrivate; isShared; hiddenFromPublic; color; kind; allDay; inactive; status;
 *       start: Instant; end: Instant; timeZone; rrule: string | null;
 *       recurrenceEndsAt: Instant | null; taskId; attributes };
 *   };
 *   // rrule strings are compared verbatim: they are rrule.js `optionsToString`
 *   // output (part order and UNTIL format included), minus the "RRULE:" prefix.
 * };
 * type CapCase = {           // "delete this and following": parseRRule → buildRRule with UNTIL
 *   name: string; description: string;
 *   input: { event: EventDbRow; fromOccurrence: Instant };
 *   expected: { rrule: string | null; recurrenceEndsAt: Instant };
 * };
 * type RecurrenceForm = {
 *   freq: "DAILY" | "WEEKLY" | "MONTHLY"; interval: number;
 *   byWeekday: number[];      // 0 = Mon … 6 = Sun
 *   end: { type: "never" } | { type: "until"; date: Instant } | { type: "count"; count: number };
 * };
 * type BuildRRuleCase = { name: string; input: RecurrenceForm | null; expected: string | null };
 * type ParseRRuleCase = { name: string; input: string | null; expected: RecurrenceForm | null };
 * ```
 */
import { TZDate } from "@date-fns/tz";

import { expandEvents } from "@/lib/recurrence/expand";
import {
  cancelOccurrence,
  capThisAndFuture,
  editAll,
  modifyOccurrence,
  splitThisAndFuture,
  type OccurrencePatch,
  type OverrideInput,
} from "@/lib/recurrence/edit-semantics";
import {
  buildRRule,
  parseRRule,
  type RecurrenceForm,
} from "@/lib/recurrence/rrule-build";
import { mapEvent, mapOverride } from "@/lib/supabase/mappers";
import type { EventRow, Occurrence } from "@/lib/types";

export const RECURRENCE_FIXTURES_PATH =
  "android/core/recurrence/src/test/resources/recurrence-fixtures.json";

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
type JsonObject = { [key: string]: Json };

// ---------------------------------------------------------------------------
// Time helpers
// ---------------------------------------------------------------------------

const BERLIN = "Europe/Berlin";
const MOSCOW = "Europe/Moscow";
const NEW_YORK = "America/New_York";

/** Real instant (ms) of a wall-clock time in `tz`. `month` is 1-based. */
function wall(tz: string, y: number, month: number, d: number, h = 0, mi = 0): number {
  return new TZDate(y, month - 1, d, h, mi, 0, tz).getTime();
}

/** UTC midnight of a calendar date — how all-day events are stored. */
function utcDate(y: number, month: number, d: number): number {
  return Date.UTC(y, month - 1, d);
}

/** Output instant: `toISOString()` (always millisecond precision, `Z`). */
function iso(ms: number): string {
  return new Date(ms).toISOString();
}

/** Input instant shaped like PostgREST's timestamptz output. */
function pgTs(ms: number): string {
  return iso(ms).replace(/\.000Z$/, "+00:00").replace(/Z$/, "+00:00");
}

// ---------------------------------------------------------------------------
// Row builders (DB shape) — fixed ids keep the output deterministic
// ---------------------------------------------------------------------------

const WORKSPACE = "a0000000-0000-4000-8000-000000000001";
const MEMBER_A = "b0000000-0000-4000-8000-00000000000a";
const MEMBER_B = "b0000000-0000-4000-8000-00000000000b";
const CATEGORY_SHARED = "c0000000-0000-4000-8000-000000000001";
const CATEGORY_PERSONAL = "c0000000-0000-4000-8000-000000000002";
const TASK = "d0000000-0000-4000-8000-000000000001";
const CREATED = Date.UTC(2026, 0, 1);

function eventId(n: number): string {
  return `e0000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
}
function overrideId(n: number): string {
  return `f0000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
}

interface EventSpec {
  id: string;
  title: string;
  start: number;
  end: number;
  timeZone: string;
  rrule?: string | null;
  recurrenceEndsAt?: number | null;
  allDay?: boolean;
  ownerId?: string;
  categoryId?: string | null;
  description?: string | null;
  location?: string | null;
  isPrivate?: boolean;
  isShared?: boolean;
  hiddenFromPublic?: boolean;
  color?: string | null;
  kind?: "event" | "context";
  inactive?: boolean;
  status?: "cancelled" | "planned" | "confirmed";
  taskId?: string | null;
  attributes?: JsonObject;
}

function eventRow(s: EventSpec): JsonObject {
  return {
    id: s.id,
    workspace_id: WORKSPACE,
    owner_id: s.ownerId ?? MEMBER_A,
    category_id: s.categoryId ?? null,
    title: s.title,
    description: s.description ?? null,
    location: s.location ?? null,
    is_private: s.isPrivate ?? false,
    is_shared: s.isShared ?? false,
    hidden_from_public: s.hiddenFromPublic ?? false,
    color: s.color ?? null,
    kind: s.kind ?? "event",
    all_day: s.allDay ?? false,
    inactive: s.inactive ?? false,
    status: s.status ?? "confirmed",
    starts_at: pgTs(s.start),
    ends_at: pgTs(s.end),
    time_zone: s.timeZone,
    rrule: s.rrule ?? null,
    recurrence_ends_at: s.recurrenceEndsAt == null ? null : pgTs(s.recurrenceEndsAt),
    task_id: s.taskId ?? null,
    attributes: s.attributes ?? {},
    created_at: pgTs(CREATED),
    updated_at: pgTs(CREATED),
  };
}

/** DB row for a domain event (used to feed split output back into expansion). */
function rowFromDomain(id: string, e: Omit<EventRow, "id" | "createdAt" | "updatedAt">): JsonObject {
  return eventRow({
    id,
    title: e.title,
    start: e.start,
    end: e.end,
    timeZone: e.timeZone,
    rrule: e.rrule,
    recurrenceEndsAt: e.recurrenceEndsAt,
    allDay: e.allDay,
    ownerId: e.ownerId,
    categoryId: e.categoryId,
    description: e.description,
    location: e.location,
    isPrivate: e.isPrivate,
    isShared: e.isShared,
    hiddenFromPublic: e.hiddenFromPublic,
    color: e.color,
    kind: e.kind,
    inactive: e.inactive,
    status: e.status,
    taskId: e.taskId,
    attributes: e.attributes as JsonObject,
  });
}

interface OverrideSpec {
  id: string;
  eventId: string;
  occurrenceDate: number;
  type: "cancel" | "modify";
  title?: string | null;
  description?: string | null;
  location?: string | null;
  categoryId?: string | null;
  start?: number | null;
  end?: number | null;
  allDay?: boolean | null;
}

function overrideRow(s: OverrideSpec): JsonObject {
  return {
    id: s.id,
    workspace_id: WORKSPACE,
    event_id: s.eventId,
    occurrence_date: pgTs(s.occurrenceDate),
    type: s.type,
    title: s.title ?? null,
    description: s.description ?? null,
    location: s.location ?? null,
    category_id: s.categoryId ?? null,
    starts_at: s.start == null ? null : pgTs(s.start),
    ends_at: s.end == null ? null : pgTs(s.end),
    all_day: s.allDay ?? null,
  };
}

// ---------------------------------------------------------------------------
// Output serializers (domain shape, ISO instants)
// ---------------------------------------------------------------------------

function occurrenceJson(o: Occurrence): JsonObject {
  return {
    key: o.key,
    eventId: o.eventId,
    occurrenceDate: iso(o.occurrenceDate),
    start: iso(o.start),
    end: iso(o.end),
    allDay: o.allDay,
    inactive: o.inactive,
    status: o.status,
    title: o.title,
    description: o.description,
    location: o.location,
    categoryId: o.categoryId,
    color: o.color,
    kind: o.kind,
    ownerId: o.ownerId,
    isPrivate: o.isPrivate,
    isShared: o.isShared,
    hiddenFromPublic: o.hiddenFromPublic,
    taskId: o.taskId,
    attributes: o.attributes as JsonObject,
    isRecurring: o.isRecurring,
    isException: o.isException,
  };
}

const PATCH_KEYS = [
  "title",
  "description",
  "location",
  "categoryId",
  "start",
  "end",
  "allDay",
  "inactive",
  "status",
] as const;

/** Patch / partial-event JSON: only present keys, times as ISO instants. */
function partialJson(p: object, keys: readonly string[]): JsonObject {
  const fields = p as Record<string, unknown>;
  const out: JsonObject = {};
  for (const k of keys) {
    const v = fields[k];
    if (v === undefined) continue;
    out[k] =
      (k === "start" || k === "end" || k === "recurrenceEndsAt") && typeof v === "number"
        ? iso(v)
        : (v as Json);
  }
  return out;
}

const patchJson = (p: OccurrencePatch): JsonObject => partialJson(p, PATCH_KEYS);

function overrideInputJson(o: OverrideInput): JsonObject {
  const out: JsonObject = {
    eventId: o.eventId,
    occurrenceDate: iso(o.occurrenceDate),
    type: o.type,
  };
  if (o.patch) out.patch = patchJson(o.patch);
  return out;
}

function domainEventJson(e: Omit<EventRow, "id" | "createdAt" | "updatedAt">): JsonObject {
  return {
    workspaceId: e.workspaceId,
    ownerId: e.ownerId,
    categoryId: e.categoryId,
    title: e.title,
    description: e.description,
    location: e.location,
    isPrivate: e.isPrivate,
    isShared: e.isShared,
    hiddenFromPublic: e.hiddenFromPublic,
    color: e.color,
    kind: e.kind,
    allDay: e.allDay,
    inactive: e.inactive,
    status: e.status,
    start: iso(e.start),
    end: iso(e.end),
    timeZone: e.timeZone,
    rrule: e.rrule,
    recurrenceEndsAt: e.recurrenceEndsAt == null ? null : iso(e.recurrenceEndsAt),
    taskId: e.taskId,
    attributes: e.attributes as JsonObject,
  };
}

function formJson(f: RecurrenceForm | null): Json {
  if (f === null) return null;
  const end: JsonObject =
    f.end.type === "until"
      ? { type: "until", date: iso(f.end.dateMs) }
      : f.end.type === "count"
        ? { type: "count", count: f.end.count }
        : { type: "never" };
  return { freq: f.freq, interval: f.interval, byWeekday: f.byWeekday, end };
}

// ---------------------------------------------------------------------------
// Case runners — every expected value comes from the real web code
// ---------------------------------------------------------------------------

interface ExpandSpec {
  name: string;
  description: string;
  events: JsonObject[];
  overrides?: JsonObject[];
  window: { start: number; end: number };
  sharedCategoryIds?: string[];
}

function expandCase(s: ExpandSpec): JsonObject {
  const overrides = s.overrides ?? [];
  const shared = s.sharedCategoryIds ?? [];
  const occurrences = expandEvents(
    s.events.map((r) => mapEvent(r)),
    overrides.map((r) => mapOverride(r)),
    s.window,
    new Set(shared),
  );
  return {
    name: s.name,
    description: s.description,
    input: {
      events: s.events,
      overrides,
      window: { start: iso(s.window.start), end: iso(s.window.end) },
      sharedCategoryIds: shared,
    },
    expected: occurrences.map(occurrenceJson),
  };
}

/** Window covering whole local days [from, to) in `tz`. */
function localDays(
  tz: string,
  from: [number, number, number],
  to: [number, number, number],
): { start: number; end: number } {
  return { start: wall(tz, ...from), end: wall(tz, ...to) };
}

// ---------------------------------------------------------------------------
// Expansion cases
// ---------------------------------------------------------------------------

function expandCases(): JsonObject[] {
  const cases: ExpandSpec[] = [];
  let n = 0;
  const nextId = () => eventId(++n);
  let o = 0;
  const nextOv = () => overrideId(++o);

  // --- Single events and window boundaries (half-open [start, end)) --------
  {
    const id = nextId();
    cases.push({
      name: "single-timed-inside-window",
      description: "A non-recurring timed event fully inside the window: one occurrence keyed by the event id.",
      events: [
        eventRow({
          id,
          title: "Dentist",
          start: wall(BERLIN, 2026, 6, 10, 14),
          end: wall(BERLIN, 2026, 6, 10, 15),
          timeZone: BERLIN,
          location: "Praxis Mitte",
          description: "Bring the insurance card",
          categoryId: CATEGORY_PERSONAL,
          color: "#c2410c",
          attributes: { energy: 2, flexibility: "fixed" },
        }),
      ],
      window: localDays(BERLIN, [2026, 6, 8], [2026, 6, 15]),
    });
  }
  {
    const id = nextId();
    cases.push({
      name: "single-straddles-window-start",
      description: "Starts before the window and ends inside it: included (intersection is half-open).",
      events: [
        eventRow({
          id,
          title: "Night shift",
          start: wall(BERLIN, 2026, 6, 7, 22),
          end: wall(BERLIN, 2026, 6, 8, 6),
          timeZone: BERLIN,
        }),
      ],
      window: localDays(BERLIN, [2026, 6, 8], [2026, 6, 9]),
    });
  }
  {
    const id = nextId();
    cases.push({
      name: "single-straddles-window-end",
      description: "Starts inside the window and ends after it: included.",
      events: [
        eventRow({
          id,
          title: "Late train",
          start: wall(BERLIN, 2026, 6, 8, 23),
          end: wall(BERLIN, 2026, 6, 9, 1),
          timeZone: BERLIN,
        }),
      ],
      window: localDays(BERLIN, [2026, 6, 8], [2026, 6, 9]),
    });
  }
  {
    const a = nextId();
    const b = nextId();
    cases.push({
      name: "single-touching-window-edges-excluded",
      description:
        "One event ends exactly at window start, another starts exactly at window end: both excluded (half-open).",
      events: [
        eventRow({
          id: a,
          title: "Ends at start",
          start: wall(BERLIN, 2026, 6, 7, 23),
          end: wall(BERLIN, 2026, 6, 8, 0),
          timeZone: BERLIN,
        }),
        eventRow({
          id: b,
          title: "Starts at end",
          start: wall(BERLIN, 2026, 6, 9, 0),
          end: wall(BERLIN, 2026, 6, 9, 1),
          timeZone: BERLIN,
        }),
      ],
      window: localDays(BERLIN, [2026, 6, 8], [2026, 6, 9]),
    });
  }
  {
    const id = nextId();
    cases.push({
      name: "single-all-day-in-local-window",
      description:
        "An all-day event is stored as UTC midnight..next UTC midnight; a Berlin-local day window (offset by the zone) still overlaps it.",
      events: [
        eventRow({
          id,
          title: "Holiday",
          start: utcDate(2026, 10, 3),
          end: utcDate(2026, 10, 4),
          timeZone: BERLIN,
          allDay: true,
        }),
      ],
      window: localDays(BERLIN, [2026, 10, 3], [2026, 10, 4]),
    });
  }
  {
    const id = nextId();
    cases.push({
      name: "single-zero-duration",
      description: "A zero-length event inside the window is included (start < win.end && end > win.start).",
      events: [
        eventRow({
          id,
          title: "Reminder",
          start: wall(NEW_YORK, 2026, 5, 4, 12),
          end: wall(NEW_YORK, 2026, 5, 4, 12),
          timeZone: NEW_YORK,
        }),
      ],
      window: localDays(NEW_YORK, [2026, 5, 4], [2026, 5, 5]),
    });
  }

  // --- DAILY across DST, both directions, three zones ---------------------
  {
    const id = nextId();
    cases.push({
      name: "daily-berlin-spring-forward",
      description:
        "Daily 09:00 Europe/Berlin across 2026-03-29 (CET→CEST): wall clock stays 09:00, UTC shifts from 08:00Z to 07:00Z.",
      events: [
        eventRow({
          id,
          title: "Standup",
          start: wall(BERLIN, 2026, 3, 20, 9),
          end: wall(BERLIN, 2026, 3, 20, 9, 30),
          timeZone: BERLIN,
          rrule: "FREQ=DAILY",
        }),
      ],
      window: localDays(BERLIN, [2026, 3, 27], [2026, 4, 1]),
    });
  }
  {
    const id = nextId();
    cases.push({
      name: "daily-berlin-fall-back",
      description: "Daily 09:00 Europe/Berlin across 2026-10-25 (CEST→CET).",
      events: [
        eventRow({
          id,
          title: "Standup",
          start: wall(BERLIN, 2026, 10, 1, 9),
          end: wall(BERLIN, 2026, 10, 1, 9, 30),
          timeZone: BERLIN,
          rrule: "FREQ=DAILY",
        }),
      ],
      window: localDays(BERLIN, [2026, 10, 23], [2026, 10, 28]),
    });
  }
  {
    const id = nextId();
    cases.push({
      name: "daily-berlin-nonexistent-local-time",
      description:
        "Daily 02:30 Europe/Berlin: 2026-03-29 02:30 does not exist (clocks jump 02:00→03:00); records how the gap is resolved.",
      events: [
        eventRow({
          id,
          title: "Backup",
          start: wall(BERLIN, 2026, 3, 25, 2, 30),
          end: wall(BERLIN, 2026, 3, 25, 3),
          timeZone: BERLIN,
          rrule: "FREQ=DAILY",
        }),
      ],
      window: localDays(BERLIN, [2026, 3, 28], [2026, 3, 31]),
    });
  }
  // NOT covered on purpose: a wall time that occurs twice on a fall-back day
  // (e.g. 02:30 Berlin on 2026-10-25). @date-fns/tz resolves that ambiguity via
  // the HOST's zone offsets, so the web's answer differs between machines
  // (verified: TZ=UTC vs TZ=Pacific/Kiritimati) — there is no single truth to pin.
  {
    const id = nextId();
    cases.push({
      name: "daily-new-york-spring-forward",
      description: "Daily 08:30 America/New_York across 2026-03-08 (EST→EDT).",
      events: [
        eventRow({
          id,
          title: "Run",
          start: wall(NEW_YORK, 2026, 3, 1, 8, 30),
          end: wall(NEW_YORK, 2026, 3, 1, 9, 15),
          timeZone: NEW_YORK,
          rrule: "FREQ=DAILY",
          ownerId: MEMBER_B,
        }),
      ],
      window: localDays(NEW_YORK, [2026, 3, 6], [2026, 3, 11]),
    });
  }
  {
    const id = nextId();
    cases.push({
      name: "daily-new-york-fall-back-late-evening",
      description:
        "Daily 23:30 America/New_York across 2026-11-01 (EDT→EST): the UTC instant crosses into the next UTC day.",
      events: [
        eventRow({
          id,
          title: "Wind down",
          start: wall(NEW_YORK, 2026, 10, 25, 23, 30),
          end: wall(NEW_YORK, 2026, 10, 26, 0, 15),
          timeZone: NEW_YORK,
          rrule: "FREQ=DAILY",
          ownerId: MEMBER_B,
        }),
      ],
      window: localDays(NEW_YORK, [2026, 10, 30], [2026, 11, 3]),
    });
  }
  {
    const id = nextId();
    cases.push({
      name: "daily-moscow-2011-spring-forward-permanent",
      description:
        "Daily 09:00 Europe/Moscow across 2011-03-27, when Moscow moved from +03 to permanent +04 (historical tzdata).",
      events: [
        eventRow({
          id,
          title: "Planning",
          start: wall(MOSCOW, 2011, 3, 20, 9),
          end: wall(MOSCOW, 2011, 3, 20, 10),
          timeZone: MOSCOW,
          rrule: "FREQ=DAILY",
        }),
      ],
      window: localDays(MOSCOW, [2011, 3, 25], [2011, 3, 30]),
    });
  }
  {
    const id = nextId();
    cases.push({
      name: "daily-moscow-2014-fall-back-permanent",
      description: "Daily 09:00 Europe/Moscow across 2014-10-26, when Moscow moved from +04 back to +03.",
      events: [
        eventRow({
          id,
          title: "Planning",
          start: wall(MOSCOW, 2014, 10, 1, 9),
          end: wall(MOSCOW, 2014, 10, 1, 10),
          timeZone: MOSCOW,
          rrule: "FREQ=DAILY",
        }),
      ],
      window: localDays(MOSCOW, [2014, 10, 24], [2014, 10, 29]),
    });
  }
  {
    const id = nextId();
    cases.push({
      name: "daily-weekdays-filter",
      description: "FREQ=DAILY;BYDAY=MO,TU,WE,TH,FR ('every weekday') over two Moscow weeks.",
      events: [
        eventRow({
          id,
          title: "Commute",
          start: wall(MOSCOW, 2026, 4, 1, 8),
          end: wall(MOSCOW, 2026, 4, 1, 8, 45),
          timeZone: MOSCOW,
          rrule: "FREQ=DAILY;BYDAY=MO,TU,WE,TH,FR",
        }),
      ],
      window: localDays(MOSCOW, [2026, 4, 6], [2026, 4, 20]),
    });
  }
  {
    const id = nextId();
    cases.push({
      name: "daily-interval-3-overnight",
      description:
        "Every 3rd day 22:00–02:00 Berlin; the window starts at local midnight so the previous night's occurrence straddles it.",
      events: [
        eventRow({
          id,
          title: "Night watch",
          start: wall(BERLIN, 2026, 5, 1, 22),
          end: wall(BERLIN, 2026, 5, 2, 2),
          timeZone: BERLIN,
          rrule: "FREQ=DAILY;INTERVAL=3",
        }),
      ],
      window: localDays(BERLIN, [2026, 5, 11], [2026, 5, 20]),
    });
  }

  // --- WEEKLY ------------------------------------------------------------
  {
    const id = nextId();
    cases.push({
      name: "weekly-byday-berlin-across-spring-forward",
      description: "FREQ=WEEKLY;BYDAY=MO,WE,FR 18:00 Berlin over three weeks spanning the March DST change.",
      events: [
        eventRow({
          id,
          title: "Gym",
          start: wall(BERLIN, 2026, 3, 2, 18),
          end: wall(BERLIN, 2026, 3, 2, 19, 30),
          timeZone: BERLIN,
          rrule: "FREQ=WEEKLY;BYDAY=MO,WE,FR",
          categoryId: CATEGORY_PERSONAL,
        }),
      ],
      window: localDays(BERLIN, [2026, 3, 23], [2026, 4, 13]),
    });
  }
  {
    const id = nextId();
    cases.push({
      name: "weekly-interval-2-byday-new-york",
      description: "FREQ=WEEKLY;INTERVAL=2;BYDAY=TU,TH 07:00 New York across the November DST change.",
      events: [
        eventRow({
          id,
          title: "Swim",
          start: wall(NEW_YORK, 2026, 10, 6, 7),
          end: wall(NEW_YORK, 2026, 10, 6, 8),
          timeZone: NEW_YORK,
          rrule: "FREQ=WEEKLY;INTERVAL=2;BYDAY=TU,TH",
          ownerId: MEMBER_B,
        }),
      ],
      window: localDays(NEW_YORK, [2026, 10, 19], [2026, 11, 30]),
    });
  }
  {
    const id = nextId();
    cases.push({
      name: "weekly-plain-full-year-berlin",
      description: "FREQ=WEEKLY (weekday from DTSTART) 10:00 Berlin across a whole year: both DST transitions.",
      events: [
        eventRow({
          id,
          title: "Market",
          start: wall(BERLIN, 2026, 1, 3, 10),
          end: wall(BERLIN, 2026, 1, 3, 12),
          timeZone: BERLIN,
          rrule: "FREQ=WEEKLY",
          isShared: true,
        }),
      ],
      window: localDays(BERLIN, [2026, 1, 1], [2027, 1, 1]),
    });
  }

  // --- MONTHLY / YEARLY ----------------------------------------------------
  {
    const id = nextId();
    cases.push({
      name: "monthly-on-31st-skips-short-months",
      description: "FREQ=MONTHLY from Jan 31 (Moscow): months without a 31st produce no occurrence.",
      events: [
        eventRow({
          id,
          title: "Pay rent",
          start: wall(MOSCOW, 2026, 1, 31, 12),
          end: wall(MOSCOW, 2026, 1, 31, 12, 30),
          timeZone: MOSCOW,
          rrule: "FREQ=MONTHLY",
        }),
      ],
      window: localDays(MOSCOW, [2026, 1, 1], [2026, 9, 1]),
    });
  }
  {
    const id = nextId();
    cases.push({
      name: "monthly-last-friday-new-york",
      description: "FREQ=MONTHLY;BYDAY=-1FR 17:00 New York (an MCP-authored rule) across both DST changes.",
      events: [
        eventRow({
          id,
          title: "Review",
          start: wall(NEW_YORK, 2026, 1, 30, 17),
          end: wall(NEW_YORK, 2026, 1, 30, 18),
          timeZone: NEW_YORK,
          rrule: "FREQ=MONTHLY;BYDAY=-1FR",
        }),
      ],
      window: localDays(NEW_YORK, [2026, 2, 1], [2026, 12, 1]),
    });
  }
  {
    const id = nextId();
    cases.push({
      name: "monthly-interval-2-bymonthday-berlin",
      description: "FREQ=MONTHLY;INTERVAL=2;BYMONTHDAY=15 08:00 Berlin.",
      events: [
        eventRow({
          id,
          title: "Haircut",
          start: wall(BERLIN, 2026, 1, 15, 8),
          end: wall(BERLIN, 2026, 1, 15, 9),
          timeZone: BERLIN,
          rrule: "FREQ=MONTHLY;INTERVAL=2;BYMONTHDAY=15",
        }),
      ],
      window: localDays(BERLIN, [2026, 1, 1], [2027, 1, 1]),
    });
  }
  {
    const id = nextId();
    cases.push({
      name: "yearly-all-day-leap-day",
      description: "FREQ=YEARLY all-day from 2024-02-29: only leap years produce an occurrence.",
      events: [
        eventRow({
          id,
          title: "Leap birthday",
          start: utcDate(2024, 2, 29),
          end: utcDate(2024, 3, 1),
          timeZone: MOSCOW,
          allDay: true,
          rrule: "FREQ=YEARLY",
        }),
      ],
      window: { start: utcDate(2024, 1, 1), end: utcDate(2033, 1, 1) },
    });
  }
  {
    const id = nextId();
    cases.push({
      name: "yearly-timed-summer-and-winter",
      description: "FREQ=YEARLY;BYMONTH=1,7 (Berlin 20:00): one winter (+01) and one summer (+02) instance per year.",
      events: [
        eventRow({
          id,
          title: "Anniversary dinner",
          start: wall(BERLIN, 2025, 1, 12, 20),
          end: wall(BERLIN, 2025, 1, 12, 22),
          timeZone: BERLIN,
          rrule: "FREQ=YEARLY;BYMONTH=1,7",
          isShared: true,
        }),
      ],
      window: localDays(BERLIN, [2026, 1, 1], [2028, 1, 1]),
    });
  }

  // --- COUNT / UNTIL / recurrence_ends_at ---------------------------------
  {
    const id = nextId();
    cases.push({
      name: "count-5-daily",
      description: "FREQ=DAILY;COUNT=5: exactly five occurrences even though the window is longer.",
      events: [
        eventRow({
          id,
          title: "Course",
          start: wall(BERLIN, 2026, 3, 26, 19),
          end: wall(BERLIN, 2026, 3, 26, 21),
          timeZone: BERLIN,
          rrule: "FREQ=DAILY;COUNT=5",
        }),
      ],
      window: localDays(BERLIN, [2026, 3, 23], [2026, 4, 6]),
    });
  }
  {
    const id = nextId();
    cases.push({
      name: "count-counts-from-dtstart-not-window",
      description: "FREQ=WEEKLY;BYDAY=TU,TH;COUNT=6 with the window starting after the first four.",
      events: [
        eventRow({
          id,
          title: "Physio",
          start: wall(NEW_YORK, 2026, 9, 1, 9),
          end: wall(NEW_YORK, 2026, 9, 1, 10),
          timeZone: NEW_YORK,
          rrule: "FREQ=WEEKLY;BYDAY=TU,TH;COUNT=6",
        }),
      ],
      window: localDays(NEW_YORK, [2026, 9, 12], [2026, 10, 3]),
    });
  }
  {
    const id = nextId();
    const until = wall(BERLIN, 2026, 6, 15, 8); // = 06:00Z, a real occurrence instant
    cases.push({
      name: "until-equals-occurrence-instant-berlin",
      description:
        "UNTIL is compared in floating wall-clock space: UNTIL=06:00Z equals the real instant of the 2026-06-15 08:00 Berlin occurrence, but its floating time (08:00) is later, so it is NOT produced.",
      events: [
        eventRow({
          id,
          title: "Language class",
          start: wall(BERLIN, 2026, 5, 4, 8),
          end: wall(BERLIN, 2026, 5, 4, 9),
          timeZone: BERLIN,
          rrule: `FREQ=WEEKLY;UNTIL=${rruleUtc(until)}`,
        }),
      ],
      window: localDays(BERLIN, [2026, 5, 25], [2026, 6, 29]),
    });
  }
  {
    const id = nextId();
    cases.push({
      name: "until-floating-keeps-later-real-instant-new-york",
      description:
        "UNTIL=2026-06-15T23:00Z with a 21:00 New York series: the 06-15 occurrence is really 01:00Z on 06-16 (after UNTIL) but floating 21:00 < 23:00, so it IS produced (no recurrence_ends_at to prune it).",
      events: [
        eventRow({
          id,
          title: "Call home",
          start: wall(NEW_YORK, 2026, 6, 1, 21),
          end: wall(NEW_YORK, 2026, 6, 1, 21, 30),
          timeZone: NEW_YORK,
          rrule: `FREQ=WEEKLY;UNTIL=${rruleUtc(Date.UTC(2026, 5, 15, 23))}`,
          ownerId: MEMBER_B,
        }),
      ],
      window: localDays(NEW_YORK, [2026, 6, 1], [2026, 7, 1]),
    });
  }
  {
    const id = nextId();
    cases.push({
      name: "recurrence-ends-at-prunes-open-rule",
      description:
        "An open-ended DAILY rule with recurrence_ends_at set: occurrences whose real start is after it are dropped.",
      events: [
        eventRow({
          id,
          title: "Antibiotics",
          start: wall(MOSCOW, 2026, 2, 1, 8),
          end: wall(MOSCOW, 2026, 2, 1, 8, 10),
          timeZone: MOSCOW,
          rrule: "FREQ=DAILY",
          recurrenceEndsAt: wall(MOSCOW, 2026, 2, 7, 8),
        }),
      ],
      window: localDays(MOSCOW, [2026, 2, 4], [2026, 2, 12]),
    });
  }

  // --- All-day recurring ---------------------------------------------------
  {
    const id = nextId();
    cases.push({
      name: "all-day-daily-ignores-event-zone-dst",
      description:
        "All-day DAILY with time_zone Europe/Berlin across the March DST change: expanded in UTC, every occurrence on UTC midnight.",
      events: [
        eventRow({
          id,
          title: "Trip",
          start: utcDate(2026, 3, 27),
          end: utcDate(2026, 3, 28),
          timeZone: BERLIN,
          allDay: true,
          rrule: "FREQ=DAILY;COUNT=4",
          kind: "context",
          categoryId: CATEGORY_SHARED,
        }),
      ],
      window: localDays(BERLIN, [2026, 3, 23], [2026, 4, 6]),
      sharedCategoryIds: [CATEGORY_SHARED],
    });
  }
  {
    const id = nextId();
    cases.push({
      name: "all-day-weekly-east-of-utc-window-edges",
      description:
        "All-day weekly SU,WE (UTC-midnight anchored, time_zone New York) against a Berlin local-week window, which starts at 23:00Z the day before: Sunday 02-01 overlaps the window's first hour and is included.",
      events: [
        eventRow({
          id,
          title: "Bins out",
          start: utcDate(2026, 1, 4),
          end: utcDate(2026, 1, 5),
          timeZone: NEW_YORK,
          allDay: true,
          rrule: "FREQ=WEEKLY;BYDAY=SU,WE",
        }),
      ],
      window: localDays(BERLIN, [2026, 2, 2], [2026, 2, 9]),
    });
  }

  // --- Overrides -----------------------------------------------------------
  {
    const id = nextId();
    const occ = (d: number) => wall(BERLIN, 2026, 4, d, 9);
    cases.push({
      name: "overrides-cancel-and-modify",
      description:
        "Daily 09:00 Berlin with: a cancel (04-07), a title/location/category change (04-08), a time move later the same day (04-09), and an all-day conversion (04-10).",
      events: [
        eventRow({
          id,
          title: "Standup",
          start: wall(BERLIN, 2026, 4, 1, 9),
          end: wall(BERLIN, 2026, 4, 1, 9, 30),
          timeZone: BERLIN,
          rrule: "FREQ=DAILY",
          categoryId: CATEGORY_PERSONAL,
          color: "#6d28d9",
          status: "planned",
        }),
      ],
      overrides: [
        overrideRow({ id: nextOv(), eventId: id, occurrenceDate: occ(7), type: "cancel" }),
        overrideRow({
          id: nextOv(),
          eventId: id,
          occurrenceDate: occ(8),
          type: "modify",
          title: "Standup (remote)",
          location: "Video call",
          description: "Join from home",
          categoryId: CATEGORY_SHARED,
        }),
        overrideRow({
          id: nextOv(),
          eventId: id,
          occurrenceDate: occ(9),
          type: "modify",
          start: wall(BERLIN, 2026, 4, 9, 11),
          end: wall(BERLIN, 2026, 4, 9, 11, 45),
        }),
        overrideRow({
          id: nextOv(),
          eventId: id,
          occurrenceDate: occ(10),
          type: "modify",
          start: utcDate(2026, 4, 10),
          end: utcDate(2026, 4, 11),
          allDay: true,
        }),
      ],
      window: localDays(BERLIN, [2026, 4, 6], [2026, 4, 12]),
      sharedCategoryIds: [CATEGORY_SHARED],
    });
  }
  {
    const id = nextId();
    const other = nextId();
    cases.push({
      name: "overrides-moved-into-and-out-of-window",
      description:
        "Weekly MO 10:00 New York. The 05-04 occurrence (far outside the padded expansion) is moved INTO the window; the 05-25 occurrence (inside) is moved OUT of it; an override for another event id is ignored.",
      events: [
        eventRow({
          id,
          title: "Sync",
          start: wall(NEW_YORK, 2026, 4, 6, 10),
          end: wall(NEW_YORK, 2026, 4, 6, 11),
          timeZone: NEW_YORK,
          rrule: "FREQ=WEEKLY;BYDAY=MO",
        }),
      ],
      overrides: [
        overrideRow({
          id: nextOv(),
          eventId: id,
          occurrenceDate: wall(NEW_YORK, 2026, 5, 4, 10),
          type: "modify",
          start: wall(NEW_YORK, 2026, 5, 27, 15),
          end: wall(NEW_YORK, 2026, 5, 27, 16),
          title: "Sync (rescheduled)",
        }),
        overrideRow({
          id: nextOv(),
          eventId: id,
          occurrenceDate: wall(NEW_YORK, 2026, 5, 25, 10),
          type: "modify",
          start: wall(NEW_YORK, 2026, 6, 10, 10),
          end: wall(NEW_YORK, 2026, 6, 10, 11),
        }),
        overrideRow({
          id: nextOv(),
          eventId: other,
          occurrenceDate: wall(NEW_YORK, 2026, 5, 18, 10),
          type: "cancel",
        }),
      ],
      window: localDays(NEW_YORK, [2026, 5, 18], [2026, 6, 1]),
    });
  }
  {
    const id = nextId();
    cases.push({
      name: "override-modify-past-recurrence-end-still-renders",
      description:
        "A modify override on an occurrence after recurrence_ends_at: the occurrence is pruned in the main pass, so the 'moved in' pass renders it at its override time (current web behavior).",
      events: [
        eventRow({
          id,
          title: "Therapy",
          start: wall(BERLIN, 2026, 9, 1, 16),
          end: wall(BERLIN, 2026, 9, 1, 17),
          timeZone: BERLIN,
          rrule: "FREQ=WEEKLY",
          recurrenceEndsAt: wall(BERLIN, 2026, 9, 15, 16),
        }),
      ],
      overrides: [
        overrideRow({
          id: nextOv(),
          eventId: id,
          occurrenceDate: wall(BERLIN, 2026, 9, 22, 16),
          type: "modify",
          start: wall(BERLIN, 2026, 9, 23, 16),
          end: wall(BERLIN, 2026, 9, 23, 17),
        }),
      ],
      window: localDays(BERLIN, [2026, 9, 14], [2026, 9, 28]),
    });
  }
  {
    const id = nextId();
    cases.push({
      name: "override-cancel-across-dst-key",
      description:
        "Cancel keyed by the real instant of a post-DST occurrence (07:00Z, not 08:00Z) in a daily 09:00 Berlin series.",
      events: [
        eventRow({
          id,
          title: "Standup",
          start: wall(BERLIN, 2026, 3, 20, 9),
          end: wall(BERLIN, 2026, 3, 20, 9, 30),
          timeZone: BERLIN,
          rrule: "FREQ=DAILY",
        }),
      ],
      overrides: [
        overrideRow({
          id: nextOv(),
          eventId: id,
          occurrenceDate: wall(BERLIN, 2026, 3, 30, 9),
          type: "cancel",
        }),
      ],
      window: localDays(BERLIN, [2026, 3, 28], [2026, 4, 1]),
    });
  }

  // --- Series-level fields, sharing, ordering -----------------------------
  {
    const a = nextId();
    const b = nextId();
    const c = nextId();
    const d = nextId();
    cases.push({
      name: "multi-event-merge-sharing-and-series-fields",
      description:
        "Four events merged and sorted by start: shared-category derivation (private wins), the is_shared flag, and series-level fields (inactive, status, color, kind, task_id, hidden_from_public, attributes) copied onto every occurrence.",
      events: [
        eventRow({
          id: a,
          title: "Breakfast",
          start: wall(BERLIN, 2026, 7, 6, 8),
          end: wall(BERLIN, 2026, 7, 6, 8, 30),
          timeZone: BERLIN,
          rrule: "FREQ=DAILY",
          categoryId: CATEGORY_SHARED,
        }),
        eventRow({
          id: b,
          title: "Journal",
          start: wall(BERLIN, 2026, 7, 6, 7),
          end: wall(BERLIN, 2026, 7, 6, 7, 20),
          timeZone: BERLIN,
          rrule: "FREQ=DAILY",
          categoryId: CATEGORY_SHARED,
          isPrivate: true,
        }),
        eventRow({
          id: c,
          title: "Sleep",
          start: wall(BERLIN, 2026, 7, 5, 23),
          end: wall(BERLIN, 2026, 7, 6, 7),
          timeZone: BERLIN,
          rrule: "FREQ=DAILY",
          ownerId: MEMBER_B,
          inactive: true,
          status: "planned",
          color: "#57534e",
          hiddenFromPublic: true,
        }),
        eventRow({
          id: d,
          title: "Write report",
          start: wall(BERLIN, 2026, 7, 7, 10),
          end: wall(BERLIN, 2026, 7, 7, 12),
          timeZone: BERLIN,
          categoryId: CATEGORY_PERSONAL,
          isShared: true,
          taskId: TASK,
          attributes: { energy: 3, focus: "deep", future_key: "kept" },
        }),
      ],
      window: localDays(BERLIN, [2026, 7, 6], [2026, 7, 8]),
      sharedCategoryIds: [CATEGORY_SHARED],
    });
  }

  // --- Split series ("this and following") fed back through expansion -----
  cases.push(...splitExpandCases(nextId));

  return cases.map(expandCase);
}

/** RFC 5545 UTC basic form used inside RRULE strings. */
function rruleUtc(ms: number): string {
  return iso(ms).replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

/** Build the split rows exactly as mutations.splitSeries persists them. */
function splitRows(
  original: JsonObject,
  newId: string,
  fromOccurrence: number,
  patch: OccurrencePatch,
): JsonObject[] {
  const event = mapEvent(original);
  const { original: capped, newSeries } = splitThisAndFuture(event, fromOccurrence, patch);
  return [
    {
      ...original,
      rrule: capped.rrule,
      recurrence_ends_at: capped.recurrenceEndsAt == null ? null : pgTs(capped.recurrenceEndsAt),
    },
    rowFromDomain(newId, newSeries),
  ];
}

function splitExpandCases(nextId: () => string): ExpandSpec[] {
  const out: ExpandSpec[] = [];
  {
    const id = nextId();
    const original = eventRow({
      id,
      title: "Piano",
      start: wall(BERLIN, 2026, 3, 2, 17),
      end: wall(BERLIN, 2026, 3, 2, 18),
      timeZone: BERLIN,
      rrule: "FREQ=WEEKLY;BYDAY=MO,WE",
    });
    out.push({
      name: "split-series-berlin-retitled-and-moved",
      description:
        "Weekly MO,WE 17:00 Berlin split at the 2026-03-30 occurrence (after DST) with a new title and a 18:00 start; window spans the split.",
      events: splitRows(original, nextId(), wall(BERLIN, 2026, 3, 30, 17), {
        title: "Piano (new teacher)",
        start: wall(BERLIN, 2026, 3, 30, 18),
      }),
      window: localDays(BERLIN, [2026, 3, 23], [2026, 4, 9]),
    });
  }
  {
    const id = nextId();
    const original = eventRow({
      id,
      title: "Evening walk",
      start: wall(NEW_YORK, 2026, 6, 1, 21),
      end: wall(NEW_YORK, 2026, 6, 1, 22),
      timeZone: NEW_YORK,
      rrule: "FREQ=DAILY",
      ownerId: MEMBER_B,
    });
    out.push({
      name: "split-series-new-york-pruned-by-recurrence-ends-at",
      description:
        "Daily 21:00 New York split at 06-10 with no patch. The capped rule's UNTIL (real split - 1s) would still admit the 06-10 occurrence in floating space; recurrence_ends_at prunes it, so the new series alone owns 06-10 onward.",
      events: splitRows(original, nextId(), wall(NEW_YORK, 2026, 6, 10, 21), {}),
      window: localDays(NEW_YORK, [2026, 6, 7], [2026, 6, 13]),
    });
  }
  {
    const id = nextId();
    const original = eventRow({
      id,
      title: "Rehab",
      start: wall(MOSCOW, 2026, 4, 1, 7),
      end: wall(MOSCOW, 2026, 4, 1, 7, 45),
      timeZone: MOSCOW,
      rrule: "FREQ=DAILY;INTERVAL=2;COUNT=10",
    });
    out.push({
      name: "split-series-count-becomes-open-ended",
      description:
        "Every-2-days COUNT=10 Moscow split at the 4th occurrence: the original swaps COUNT for UNTIL, the new series drops COUNT and is open-ended.",
      events: splitRows(original, nextId(), wall(MOSCOW, 2026, 4, 7, 7), {
        location: "Clinic 2",
      }),
      window: localDays(MOSCOW, [2026, 4, 1], [2026, 5, 1]),
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Edit-semantics cases
// ---------------------------------------------------------------------------

/** A recurring master row reused by the edit-semantics cases. */
function masterRow(): JsonObject {
  return eventRow({
    id: eventId(900),
    title: "Yoga",
    start: wall(BERLIN, 2026, 3, 3, 7),
    end: wall(BERLIN, 2026, 3, 3, 8),
    timeZone: BERLIN,
    rrule: "FREQ=WEEKLY;BYDAY=TU,TH",
    categoryId: CATEGORY_PERSONAL,
    description: "Mat in the hallway",
    location: "Studio",
    color: "#0f766e",
    attributes: { energy: 2 },
  });
}

function overrideInputCases(): JsonObject[] {
  const id = eventId(900);
  const occ = wall(BERLIN, 2026, 3, 31, 7);
  const patch: OccurrencePatch = {
    title: "Yoga outside",
    location: null,
    start: wall(BERLIN, 2026, 3, 31, 8),
    end: wall(BERLIN, 2026, 3, 31, 9),
  };
  return [
    {
      name: "cancel-occurrence",
      description: "cancelOccurrence: a cancel keyed by the original occurrence start, no patch.",
      input: { op: "cancel", eventId: id, occurrenceDate: iso(occ) },
      expected: overrideInputJson(cancelOccurrence(id, occ)),
    },
    {
      name: "modify-occurrence",
      description: "modifyOccurrence: the patch is carried verbatim (null clears a field).",
      input: { op: "modify", eventId: id, occurrenceDate: iso(occ), patch: patchJson(patch) },
      expected: overrideInputJson(modifyOccurrence(id, occ, patch)),
    },
  ];
}

function editAllCases(): JsonObject[] {
  const row = masterRow();
  const event = mapEvent(row);
  const specs: { name: string; description: string; patch: OccurrencePatch }[] = [
    {
      name: "fields-only",
      description: "Scalar fields only; times untouched.",
      patch: { title: "Morning yoga", description: null, categoryId: null, status: "planned" },
    },
    {
      name: "start-shifts-end",
      description: "Moving start without end shifts end by the same delta (duration kept).",
      patch: { start: wall(BERLIN, 2026, 3, 3, 6, 30) },
    },
    {
      name: "start-and-end",
      description: "Explicit start and end are both taken as given.",
      patch: { start: wall(BERLIN, 2026, 3, 3, 6), end: wall(BERLIN, 2026, 3, 3, 8) },
    },
    {
      name: "end-only",
      description: "End alone changes only end.",
      patch: { end: wall(BERLIN, 2026, 3, 3, 8, 30) },
    },
    {
      name: "falsy-values",
      description: "allDay=false and inactive=false are real patch values, not absences.",
      patch: { allDay: false, inactive: false, location: "" },
    },
    { name: "empty", description: "An empty patch yields an empty change set.", patch: {} },
  ];
  return specs.map((s) => ({
    name: s.name,
    description: s.description,
    input: { event: row, patch: patchJson(s.patch) },
    expected: partialJson(editAll(event, s.patch), PATCH_KEYS),
  }));
}

function splitCases(): JsonObject[] {
  const specs: {
    name: string;
    description: string;
    row: JsonObject;
    from: number;
    patch: OccurrencePatch;
  }[] = [
    {
      name: "weekly-byday-no-patch",
      description: "Original gets UNTIL = from - 1s; new series keeps BYDAY, starts at the split.",
      row: masterRow(),
      from: wall(BERLIN, 2026, 4, 2, 7),
      patch: {},
    },
    {
      name: "weekly-byday-with-patch",
      description: "Patch start/title/category/inactive flow into the new series; end shifts with start.",
      row: masterRow(),
      from: wall(BERLIN, 2026, 4, 2, 7),
      patch: {
        start: wall(BERLIN, 2026, 4, 2, 7, 30),
        title: "Yoga (studio B)",
        categoryId: CATEGORY_SHARED,
        inactive: true,
        status: "cancelled",
      },
    },
    {
      name: "explicit-end",
      description: "An explicit patch end is used as-is.",
      row: masterRow(),
      from: wall(BERLIN, 2026, 4, 2, 7),
      patch: { end: wall(BERLIN, 2026, 4, 2, 9) },
    },
    {
      name: "count-replaced-by-until",
      description: "COUNT is dropped on both halves; the original gets UNTIL instead.",
      row: eventRow({
        id: eventId(901),
        title: "Course",
        start: wall(NEW_YORK, 2026, 9, 1, 18),
        end: wall(NEW_YORK, 2026, 9, 1, 20),
        timeZone: NEW_YORK,
        rrule: "FREQ=WEEKLY;INTERVAL=2;BYDAY=TU;COUNT=8",
        ownerId: MEMBER_B,
      }),
      from: wall(NEW_YORK, 2026, 11, 10, 18),
      patch: { description: "Room 4" },
    },
    {
      name: "until-replaced",
      description: "An existing UNTIL is replaced on the original and removed on the new series.",
      row: eventRow({
        id: eventId(902),
        title: "Season",
        start: utcDate(2026, 5, 1),
        end: utcDate(2026, 5, 2),
        timeZone: MOSCOW,
        allDay: true,
        rrule: "FREQ=MONTHLY;BYMONTHDAY=1;UNTIL=20261201T000000Z",
        kind: "context",
        categoryId: CATEGORY_SHARED,
      }),
      from: utcDate(2026, 8, 1),
      patch: { allDay: true },
    },
    {
      name: "non-recurring",
      description: "A single event: both rrules stay null; recurrenceEndsAt is still set on the original.",
      row: eventRow({
        id: eventId(903),
        title: "One-off",
        start: wall(BERLIN, 2026, 5, 5, 12),
        end: wall(BERLIN, 2026, 5, 5, 13),
        timeZone: BERLIN,
      }),
      from: wall(BERLIN, 2026, 5, 5, 12),
      patch: {},
    },
  ];
  return specs.map((s) => {
    const { original, newSeries } = splitThisAndFuture(mapEvent(s.row), s.from, s.patch);
    return {
      name: s.name,
      description: s.description,
      input: { event: s.row, fromOccurrence: iso(s.from), patch: patchJson(s.patch) },
      expected: {
        original: {
          id: original.id,
          rrule: original.rrule,
          recurrenceEndsAt: original.recurrenceEndsAt == null ? null : iso(original.recurrenceEndsAt),
        },
        newSeries: domainEventJson(newSeries),
      },
    };
  });
}

function capCases(): JsonObject[] {
  const specs: { name: string; description: string; row: JsonObject; from: number }[] = [
    {
      name: "weekly-byday",
      description: "Weekly BYDAY series capped before an occurrence.",
      row: masterRow(),
      from: wall(BERLIN, 2026, 4, 2, 7),
    },
    {
      name: "count-becomes-until",
      description: "COUNT is replaced by UNTIL (buildRRule emits only one end).",
      row: eventRow({
        id: eventId(904),
        title: "Drops",
        start: wall(MOSCOW, 2026, 2, 1, 21),
        end: wall(MOSCOW, 2026, 2, 1, 21, 5),
        timeZone: MOSCOW,
        rrule: "FREQ=DAILY;INTERVAL=2;COUNT=20",
      }),
      from: wall(MOSCOW, 2026, 2, 9, 21),
    },
    {
      name: "yearly-kept",
      description: "A YEARLY rule keeps its frequency: only UNTIL is added.",
      row: eventRow({
        id: eventId(905),
        title: "Checkup",
        start: wall(BERLIN, 2026, 1, 20, 9),
        end: wall(BERLIN, 2026, 1, 20, 10),
        timeZone: BERLIN,
        rrule: "FREQ=YEARLY",
      }),
      from: wall(BERLIN, 2027, 1, 20, 9),
    },
    {
      name: "yearly-bymonth-ordinal-kept",
      description: "Last Sunday in March: BYMONTH and the -1SU ordinal survive the cap.",
      row: eventRow({
        id: eventId(907),
        title: "Clocks change",
        start: wall(BERLIN, 2026, 3, 29, 9),
        end: wall(BERLIN, 2026, 3, 29, 10),
        timeZone: BERLIN,
        rrule: "FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU",
      }),
      from: wall(BERLIN, 2028, 3, 26, 9),
    },
    {
      name: "monthly-nth-weekday-kept",
      description: "Second Tuesday monthly: the 2TU ordinal survives (no jump to the start's day-of-month).",
      row: eventRow({
        id: eventId(908),
        title: "Book club",
        start: wall(MOSCOW, 2026, 1, 13, 19),
        end: wall(MOSCOW, 2026, 1, 13, 21),
        timeZone: MOSCOW,
        rrule: "FREQ=MONTHLY;BYDAY=2TU;COUNT=12",
      }),
      from: wall(MOSCOW, 2026, 6, 9, 19),
    },
    {
      name: "monthly-bysetpos-kept",
      description: "Last weekday of the month: BYSETPOS survives.",
      row: eventRow({
        id: eventId(909),
        title: "Invoices",
        start: wall(BERLIN, 2026, 1, 30, 16),
        end: wall(BERLIN, 2026, 1, 30, 17),
        timeZone: BERLIN,
        rrule: "FREQ=MONTHLY;BYDAY=MO,TU,WE,TH,FR;BYSETPOS=-1",
      }),
      from: wall(BERLIN, 2026, 7, 31, 16),
    },
    {
      name: "non-recurring",
      description: "No rule: rrule stays null.",
      row: eventRow({
        id: eventId(906),
        title: "One-off",
        start: wall(BERLIN, 2026, 5, 5, 12),
        end: wall(BERLIN, 2026, 5, 5, 13),
        timeZone: BERLIN,
      }),
      from: wall(BERLIN, 2026, 5, 5, 12),
    },
  ];
  return specs.map((s) => {
    const result = capThisAndFuture(mapEvent(s.row), s.from);
    return {
      name: s.name,
      description: s.description,
      input: { event: s.row, fromOccurrence: iso(s.from) },
      expected: { rrule: result.rrule, recurrenceEndsAt: iso(result.recurrenceEndsAt) },
    };
  });
}

// ---------------------------------------------------------------------------
// RRULE form cases
// ---------------------------------------------------------------------------

function buildRRuleCases(): JsonObject[] {
  const forms: { name: string; form: RecurrenceForm | null }[] = [
    { name: "null", form: null },
    { name: "daily", form: { freq: "DAILY", interval: 1, byWeekday: [], end: { type: "never" } } },
    { name: "daily-interval", form: { freq: "DAILY", interval: 3, byWeekday: [], end: { type: "never" } } },
    {
      name: "daily-weekdays-ignores-interval",
      form: { freq: "DAILY", interval: 2, byWeekday: [4, 0, 2, 1, 3], end: { type: "never" } },
    },
    {
      name: "weekly-byday-sorted",
      form: { freq: "WEEKLY", interval: 1, byWeekday: [6, 0, 2], end: { type: "never" } },
    },
    {
      name: "weekly-interval-until",
      form: {
        freq: "WEEKLY",
        interval: 2,
        byWeekday: [1, 3],
        end: { type: "until", dateMs: Date.UTC(2026, 11, 31, 22, 59, 59) },
      },
    },
    { name: "weekly-no-days", form: { freq: "WEEKLY", interval: 1, byWeekday: [], end: { type: "count", count: 10 } } },
    {
      name: "monthly-ignores-days",
      form: { freq: "MONTHLY", interval: 1, byWeekday: [0], end: { type: "count", count: 12 } },
    },
    { name: "monthly-interval", form: { freq: "MONTHLY", interval: 6, byWeekday: [], end: { type: "never" } } },
  ];
  return forms.map(({ name, form }) => ({
    name,
    input: formJson(form),
    expected: buildRRule(form),
  }));
}

function parseRRuleCases(): JsonObject[] {
  const rules: { name: string; rrule: string | null }[] = [
    { name: "null", rrule: null },
    { name: "daily", rrule: "FREQ=DAILY" },
    { name: "daily-weekdays", rrule: "FREQ=DAILY;BYDAY=MO,TU,WE,TH,FR" },
    { name: "weekly-unsorted-days", rrule: "FREQ=WEEKLY;BYDAY=SU,MO,WE" },
    { name: "weekly-interval-until", rrule: "FREQ=WEEKLY;INTERVAL=2;BYDAY=TU,TH;UNTIL=20261231T225959Z" },
    { name: "monthly-count", rrule: "FREQ=MONTHLY;COUNT=12" },
    { name: "interval-1-explicit", rrule: "FREQ=DAILY;INTERVAL=1" },
    { name: "yearly-falls-back-to-weekly", rrule: "FREQ=YEARLY;BYMONTH=1,7" },
    { name: "rrule-prefix", rrule: "RRULE:FREQ=WEEKLY;BYDAY=FR" },
  ];
  return rules.map(({ name, rrule }) => ({
    name,
    input: rrule,
    expected: formJson(parseRRule(rrule)),
  }));
}

// ---------------------------------------------------------------------------

/** Every fixture section, computed by the real lib/recurrence functions. */
export function buildRecurrenceFixtures(): JsonObject {
  return {
    version: 1,
    generatedBy: "scripts/export-recurrence-fixtures.ts",
    expand: expandCases(),
    overrideInputs: overrideInputCases(),
    editAll: editAllCases(),
    splitThisAndFuture: splitCases(),
    capThisAndFuture: capCases(),
    buildRRule: buildRRuleCases(),
    parseRRule: parseRRuleCases(),
  };
}

/** Canonical file contents (2-space JSON + trailing newline). */
export function serializeRecurrenceFixtures(fixtures: JsonObject = buildRecurrenceFixtures()): string {
  return `${JSON.stringify(fixtures, null, 2)}\n`;
}
