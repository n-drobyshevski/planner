/**
 * Shared building blocks of the Insights golden fixtures (see
 * scripts/insights-fixtures.ts for the pipeline and the common schema): the
 * zone matrix and calendar anchors, zone-explicit wall-clock construction, a
 * deterministic PRNG and scenario generator, and the translators from the
 * fixture JSON shapes to the web's domain types.
 *
 * Rule for every builder: never read the process zone. No `new Date(y, m, d)`,
 * no local `getHours()`; use `Date.UTC`, `wall()` or date-fns with `{ in }`.
 * The exporter and the drift guard re-run every builder under hostile zones
 * (Pacific/Chatham, America/Santiago) and fail on any difference.
 *
 * Known library limit: @date-fns/tz loops forever when the PROCESS zone is
 * Pacific/Chatham and a computation in America/Santiago crosses a day on which
 * both zones fall back (2024-04-07, 2025-04-06, 2026-04-05, 2027-04-04). The
 * Chatham child would hang, so keep Santiago data and windows (previous windows
 * included) off those days: check with `crossesHostileTransition`.
 */
import { parseAttributes } from "@/lib/attributes/schema";
import type { Occurrence, TaskRow } from "@/lib/types";

// --- Common schema --------------------------------------------------------------

/** Epoch ms (always an integer; never an ISO string in this fixture set). */
export type Ms = number;
/** IANA zone id. */
export type Zone = string;

export interface WindowJson {
  start: Ms;
  end: Ms;
}

/** One occurrence as analytics sees it (the Kotlin `Span`). */
export interface SpanJson {
  key: string;
  eventId: string;
  title: string;
  start: Ms;
  end: Ms;
  kind: "event" | "context";
  allDay: boolean;
  inactive: boolean;
  ownerId: string;
  isShared: boolean;
  categoryId: string | null;
  /** RAW bag, parsed by the code under test; may hold junk ("energy": "high") */
  attributes: Record<string, unknown>;
}

/** One task as analytics sees it (the Kotlin `InsightTask`). */
export interface TaskJson {
  id: string;
  title: string;
  parentId: string | null;
  collectionId: string | null;
  ownerId: string;
  assigneeId: string | null;
  createdAt: Ms;
  completedAt: Ms | null;
  /** "yyyy-MM-dd" */
  dueDate: string | null;
}

/** One fixture case. Names are unique per section. */
export interface Case {
  name: string;
  input: object;
  expected: unknown;
}

/** An area builder: the sections it promises, in file order, and their cases. */
export interface AreaModule {
  sections: readonly string[];
  build(): Record<string, Case[]>;
}

// --- Zones and anchors ----------------------------------------------------------

export const ZONES = [
  "UTC",
  "Europe/Berlin",
  "America/Los_Angeles",
  "Asia/Kolkata",
  "Europe/Moscow",
  "America/Santiago",
] as const;

/** Local calendar anchors. */
export const ANCHOR_DATES = [
  "2026-03-29", // Berlin spring-forward (Sun); LA already DST
  "2026-10-25", // Berlin fall-back (Sun)
  "2026-03-08", // LA spring-forward (Sun)
  "2026-11-01", // LA fall-back (Sun)
  "2026-06-10", // ordinary mid-month Wednesday
  "2026-01-01", // year boundary (prev windows cross into 2025)
  "2026-02-28", // month end, short month
  "2026-09-06", // Santiago spring-forward AT local midnight (00:00 → 01:00): the day starts at 01:00
] as const;

/** Local wall times paired with each anchor in Matrix A. */
export const ANCHOR_TIMES = ["00:30", "23:30"] as const;

export const MINUTE = 60_000;
export const HOUR = 3_600_000;
export const DAY = 86_400_000;

// --- Wall-clock construction ------------------------------------------------------

const offsetFormats = new Map<string, Intl.DateTimeFormat>();

/** Offset of `zone` from UTC at instant `ms` (ms east of UTC), from Intl only. */
function offsetAt(ms: Ms, zone: Zone): number {
  let fmt = offsetFormats.get(zone);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat("en-US", {
      timeZone: zone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    offsetFormats.set(zone, fmt);
  }
  const f: Record<string, number> = {};
  for (const p of fmt.formatToParts(ms)) if (p.type !== "literal") f[p.type] = Number(p.value);
  const asUtc = Date.UTC(f.year, f.month - 1, f.day, f.hour, f.minute, f.second);
  const whole = ms - (((ms % 1000) + 1000) % 1000);
  return asUtc - whole;
}

/**
 * Epoch ms of a local wall time ("yyyy-MM-ddTHH:mm" or with ":ss") in `zone`.
 * Resolved like java.time: a repeated time takes the EARLIER instant, a time
 * inside a gap moves forward by the gap. Built on Intl offsets only, so the
 * result never depends on the process zone (TZDate's wall-time constructor
 * does, for the repeated hour).
 */
export function wall(zone: Zone, isoLocal: string): Ms {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(isoLocal);
  if (!m) throw new Error(`wall: bad local time ${isoLocal}`);
  const asUtc = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], m[6] ? +m[6] : 0);
  const before = offsetAt(asUtc - DAY, zone);
  const after = offsetAt(asUtc + DAY, zone);
  const valid = [asUtc - before, asUtc - after].filter((c) => offsetAt(c, zone) === asUtc - c);
  if (valid.length > 0) return Math.min(...valid);
  return asUtc - before; // gap: shift forward by its length
}

/** "yyyy-MM-dd" plus `n` calendar days (zone-free). */
export function addDate(date: string, n: number): string {
  const [y, mo, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, mo - 1, d + n)).toISOString().slice(0, 10);
}

/** Inclusive count of calendar days from `first` to `last` ("yyyy-MM-dd"). */
export function dateSpan(first: string, last: string): number {
  const [y1, m1, d1] = first.split("-").map(Number);
  const [y2, m2, d2] = last.split("-").map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / DAY) + 1;
}

/** Local midnight of `date` in `zone` (on a gap day: the first valid instant). */
export function dayStart(zone: Zone, date: string): Ms {
  return wall(zone, `${date}T00:00`);
}

/**
 * Matrix A′ edge instants for `zone`: the exact start of each anchor day, plus,
 * for Europe/Berlin only, both instants of the repeated 02:30 on 2026-10-25
 * (00:30Z = 02:30 CEST and 01:30Z = 02:30 CET), built from UTC.
 */
export function edgeInstants(zone: Zone): Ms[] {
  const starts = ANCHOR_DATES.map((d) => dayStart(zone, d));
  if (zone !== "Europe/Berlin") return starts;
  return [...starts, Date.UTC(2026, 9, 25, 0, 30), Date.UTC(2026, 9, 25, 1, 30)];
}

/**
 * Days on which a zone in ZONES changes offset on the same date as a hostile
 * process zone, which @date-fns/tz cannot handle (see the module note).
 */
export const HOSTILE_TRANSITION_DATES: Partial<Record<Zone, readonly string[]>> = {
  "America/Santiago": ["2024-04-07", "2025-04-06", "2026-04-05", "2027-04-04"],
};

/**
 * Whether the local dates `[first, endExclusive)` ("yyyy-MM-dd") in `zone`
 * come within a day of a HOSTILE_TRANSITION_DATES entry. A case for which this
 * is true must not be built: the Chatham digest would never finish.
 */
export function crossesHostileTransition(zone: Zone, first: string, endExclusive: string): boolean {
  const lo = addDate(first, -1);
  const hi = addDate(endExclusive, 1);
  return (HOSTILE_TRANSITION_DATES[zone] ?? []).some((d) => d >= lo && d < hi);
}

const dateFormats = new Map<string, Intl.DateTimeFormat>();

/** The local calendar date ("yyyy-MM-dd") of `ms` in `zone`, from Intl only. */
export function localDateOf(ms: Ms, zone: Zone): string {
  let fmt = dateFormats.get(zone);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" });
    dateFormats.set(zone, fmt);
  }
  return fmt.format(ms);
}

// --- Builders for the JSON shapes ------------------------------------------------

/** A SpanJson with test defaults (a viewer-owned, tracked, uncategorized event). */
export function span(over: Partial<SpanJson> & { key: string; start: Ms; end: Ms }): SpanJson {
  return {
    eventId: over.key,
    title: over.key,
    kind: "event",
    allDay: false,
    inactive: false,
    ownerId: "me",
    isShared: false,
    categoryId: null,
    attributes: {},
    ...over,
  };
}

/**
 * A SpanJson from a compact local range in `zone`: "2026-06-01T09:00/11:00"
 * (same day) or "2026-06-01T23:00/2026-06-02T01:30".
 */
export function parseSpan(
  zone: Zone,
  range: string,
  over: Partial<SpanJson> & { key: string },
): SpanJson {
  const [from, to] = range.split("/");
  const end = to.includes("T") ? to : `${from.slice(0, 10)}T${to}`;
  return span({ start: wall(zone, from), end: wall(zone, end), ...over });
}

/** A TaskJson with test defaults (a viewer-owned, open, top-level task). */
export function task(over: Partial<TaskJson> & { id: string; createdAt: Ms }): TaskJson {
  return {
    title: over.id,
    parentId: null,
    collectionId: null,
    ownerId: "me",
    assigneeId: null,
    completedAt: null,
    dueDate: null,
    ...over,
  };
}

/** The web `Occurrence` a SpanJson stands for (attributes parsed like the mapper does). */
export function toOccurrence(s: SpanJson): Occurrence {
  return {
    key: s.key,
    eventId: s.eventId,
    occurrenceDate: s.start,
    start: s.start,
    end: s.end,
    allDay: s.allDay,
    inactive: s.inactive,
    status: "confirmed",
    title: s.title,
    description: null,
    location: null,
    categoryId: s.categoryId,
    color: null,
    kind: s.kind,
    ownerId: s.ownerId,
    isPrivate: false,
    isShared: s.isShared,
    hiddenFromPublic: false,
    taskId: null,
    attributes: parseAttributes(s.attributes),
    isRecurring: false,
    isException: false,
  };
}

/** The web `TaskRow` a TaskJson stands for (remaining fields defaulted). */
export function toTaskRow(t: TaskJson): TaskRow {
  return {
    id: t.id,
    workspaceId: "ws",
    ownerId: t.ownerId,
    assigneeId: t.assigneeId,
    parentId: t.parentId,
    collectionId: t.collectionId,
    categoryId: null,
    title: t.title,
    description: null,
    isPrivate: false,
    color: null,
    boardId: null,
    priority: null,
    dueDate: t.dueDate,
    startDate: null,
    isMilestone: false,
    position: 0,
    sequential: false,
    completedAt: t.completedAt,
    attributes: {},
    createdAt: t.createdAt,
    updatedAt: t.createdAt,
  };
}

// --- Determinism ------------------------------------------------------------------

/** Deterministic PRNG in [0, 1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * A translator for the lede builders that records instead of formatting: each
 * call returns `JSON.stringify({ key, args })`, so a lede line can be parsed
 * back into its message key and ICU arguments.
 */
export function recordingTranslator(): (key: string, values?: Record<string, unknown>) => string {
  return (key, values) => JSON.stringify({ key, args: values ?? {} });
}

// --- Scenario generator --------------------------------------------------------------

const CATEGORIES = ["c1", "c2", "c3", "c4", "c5", "c6", "c7", null] as const;
const TITLES = ["Write", "Review", "Gym", "Read", "Call", "Plan", "Cook", "Errands"] as const;
const JUNK: Record<string, unknown>[] = [
  { energy: "high" },
  { satisfaction: 5 },
  { energy: "3" },
  { focus: true },
];

/** Explicit DST stress spans, built from UTC instants (zone → spans). */
const DST_STRESS: Record<string, { start: Ms; end: Ms; label: string }[]> = {
  "Europe/Berlin": [
    // 2026-03-29 01:30 CET → 03:30 CEST, across the skipped hour.
    { start: Date.UTC(2026, 2, 29, 0, 30), end: Date.UTC(2026, 2, 29, 1, 30), label: "spring" },
    // 2026-10-25 01:30 CEST → 03:30 CET, across the repeated hour.
    { start: Date.UTC(2026, 9, 24, 23, 30), end: Date.UTC(2026, 9, 25, 2, 30), label: "fall" },
  ],
  "America/Los_Angeles": [
    // 2026-03-08 01:30 PST → 03:30 PDT.
    { start: Date.UTC(2026, 2, 8, 9, 30), end: Date.UTC(2026, 2, 8, 10, 30), label: "spring" },
    // 2026-11-01 00:30 PDT → 02:30 PST.
    { start: Date.UTC(2026, 10, 1, 7, 30), end: Date.UTC(2026, 10, 1, 10, 30), label: "fall" },
  ],
  "America/Santiago": [
    // 2026-09-05 23:30 (−04) → 2026-09-06 01:30 (−03), across the skipped midnight hour.
    { start: Date.UTC(2026, 8, 6, 3, 30), end: Date.UTC(2026, 8, 6, 4, 30), label: "spring" },
  ],
};

function hhmm(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/**
 * A deterministic, realistic slice of a calendar: `days` local days from
 * `firstDay` in `zone`. Per day, driven by `seed`:
 * - 2–5 timed events between 07:00 and 22:00 in c1…c7 or uncategorized; about a
 *   fifth owned by "partner" (half of those joint), a few joint ones of the viewer;
 * - every 3rd day an event crossing local midnight (23:00 → 01:30);
 * - every day an inactive "Sleep" block (23:30 → 07:00);
 * - every 4th day a `context` backdrop (09:00 → 17:00);
 * - every 7th day an all-day item;
 * - attributes: energy + satisfaction on ~60%, focus on ~50%, flexibility on
 *   ~30%, and junk values on ~5% ("high", 5, "3", true);
 * - plus the DST stress spans of `zone` that fall inside the range.
 * About 6 spans per day: keep `days` ≤ 20 for a case under 120 spans.
 */
export function scenario(opts: {
  zone: Zone;
  firstDay: string;
  days: number;
  seed: number;
  viewerId?: string;
}): SpanJson[] {
  const { zone, firstDay, days, seed } = opts;
  const viewer = opts.viewerId ?? "me";
  const rand = mulberry32(seed);
  const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)];
  const out: SpanJson[] = [];
  const attributes = (): Record<string, unknown> => {
    const a: Record<string, unknown> = {};
    if (rand() < 0.6) {
      a.energy = 1 + Math.floor(rand() * 4);
      a.satisfaction = 1 + Math.floor(rand() * 4);
    }
    if (rand() < 0.5) a.focus = rand() < 0.5 ? "deep" : "shallow";
    if (rand() < 0.3) a.flexibility = pick(["fixed", "movable", "flexible"] as const);
    if (rand() < 0.05) Object.assign(a, pick(JUNK));
    return a;
  };

  for (let i = 0; i < days; i++) {
    const date = addDate(firstDay, i);
    const next = addDate(firstDay, i + 1);
    const id = (suffix: string) => `s${seed}-${date}-${suffix}`;

    const count = 2 + Math.floor(rand() * 4);
    for (let j = 0; j < count; j++) {
      const duration = 15 * (1 + Math.floor(rand() * 12));
      const from = 7 * 60 + 15 * Math.floor((rand() * (15 * 60 - duration)) / 15);
      const partner = rand() < 0.2;
      out.push(
        span({
          key: id(`e${j}`),
          title: `${pick(TITLES)} ${j}`,
          start: wall(zone, `${date}T${hhmm(from)}`),
          end: wall(zone, `${date}T${hhmm(from + duration)}`),
          ownerId: partner ? "partner" : viewer,
          isShared: partner ? rand() < 0.5 : rand() < 0.1,
          categoryId: pick(CATEGORIES),
          attributes: attributes(),
        }),
      );
    }
    if (i % 3 === 0) {
      out.push(
        span({
          key: id("late"),
          title: "Late shift",
          start: wall(zone, `${date}T23:00`),
          end: wall(zone, `${next}T01:30`),
          ownerId: viewer,
          categoryId: pick(CATEGORIES),
          attributes: attributes(),
        }),
      );
    }
    out.push(
      span({
        key: id("sleep"),
        title: "Sleep",
        start: wall(zone, `${date}T23:30`),
        end: wall(zone, `${next}T07:00`),
        ownerId: viewer,
        inactive: true,
        categoryId: "c7",
      }),
    );
    if (i % 4 === 0) {
      out.push(
        span({
          key: id("ctx"),
          title: "Work block",
          start: wall(zone, `${date}T09:00`),
          end: wall(zone, `${date}T17:00`),
          ownerId: viewer,
          kind: "context",
          categoryId: "c1",
        }),
      );
    }
    if (i % 7 === 0) {
      out.push(
        span({
          key: id("allday"),
          title: "Holiday",
          start: dayStart(zone, date),
          end: dayStart(zone, next),
          ownerId: viewer,
          allDay: true,
          isShared: true,
        }),
      );
    }
  }

  const rangeStart = dayStart(zone, firstDay);
  const rangeEnd = dayStart(zone, addDate(firstDay, days));
  for (const s of DST_STRESS[zone] ?? []) {
    if (s.start >= rangeStart && s.start < rangeEnd) {
      out.push(
        span({
          key: `s${seed}-dst-${s.label}`,
          title: `DST ${s.label}`,
          start: s.start,
          end: s.end,
          ownerId: viewer,
          categoryId: "c3",
          attributes: { energy: 2, satisfaction: 3, focus: "deep" },
        }),
      );
    }
  }
  return out;
}
