// Map a recurrence form <-> RFC5545 RRULE string (NO DTSTART line).
// Times are epoch milliseconds (UTC). byWeekday uses 0=Mon..6=Sun.

import { format } from "date-fns";
import { RRule, type Options, Weekday } from "rrule";

export type Freq = "DAILY" | "WEEKLY" | "MONTHLY";

export type RecurrenceEnd =
  | { type: "never" }
  | { type: "until"; dateMs: number }
  | { type: "count"; count: number };

export interface RecurrenceForm {
  freq: Freq;
  /** repeat every N units; 1 omits INTERVAL in the output string */
  interval: number;
  /** weekdays for WEEKLY recurrences, 0=Mon..6=Sun */
  byWeekday: number[];
  end: RecurrenceEnd;
}

// Our weekday index 0=Mon..6=Sun maps directly onto rrule's Weekday.weekday
// (RRule.MO.weekday === 0 ... RRule.SU.weekday === 6).
const WEEKDAYS: readonly Weekday[] = [
  RRule.MO,
  RRule.TU,
  RRule.WE,
  RRule.TH,
  RRule.FR,
  RRule.SA,
  RRule.SU,
];

const ENUM_TO_FREQ: Record<number, Freq> = {
  [RRule.DAILY]: "DAILY",
  [RRule.WEEKLY]: "WEEKLY",
  [RRule.MONTHLY]: "MONTHLY",
};

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** Format epoch ms as RFC5545 UTC basic form: YYYYMMDDTHHMMSSZ. */
function toUntilBasic(ms: number): string {
  const d = new Date(ms);
  return (
    `${d.getUTCFullYear()}` +
    `${pad2(d.getUTCMonth() + 1)}` +
    `${pad2(d.getUTCDate())}` +
    `T` +
    `${pad2(d.getUTCHours())}` +
    `${pad2(d.getUTCMinutes())}` +
    `${pad2(d.getUTCSeconds())}` +
    `Z`
  );
}

/** Parse RFC5545 UTC basic form YYYYMMDDTHHMMSSZ back to epoch ms. */
function fromUntilBasic(s: string): number {
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(s);
  if (!m) {
    // Fall back to Date parsing for any other (e.g. extended) form.
    return new Date(s).getTime();
  }
  const [, y, mo, da, h, mi, se] = m;
  return Date.UTC(
    Number(y),
    Number(mo) - 1,
    Number(da),
    Number(h),
    Number(mi),
    Number(se)
  );
}

/**
 * Build an RFC5545 RRULE string (no DTSTART) from a recurrence form.
 * Returns null when the form is null.
 */
export function buildRRule(form: RecurrenceForm | null): string | null {
  if (form === null) return null;

  // BYDAY applies to weekly recurrences and to daily recurrences used as a
  // weekday filter ("every weekday", "Mon/Wed/Fri").
  const hasDays =
    (form.freq === "WEEKLY" || form.freq === "DAILY") && form.byWeekday.length > 0;

  const parts: string[] = [`FREQ=${form.freq}`];

  // A daily weekday filter is really a weekly cadence; INTERVAL would mean
  // "every N days" and drift off the chosen weekdays, so we omit it there.
  // Callers should pass interval 1 in that case; a stale interval > 1 is
  // intentionally ignored.
  const showInterval = form.interval > 1 && !(form.freq === "DAILY" && hasDays);
  if (showInterval) {
    parts.push(`INTERVAL=${form.interval}`);
  }

  if (hasDays) {
    const days = [...form.byWeekday]
      .sort((a, b) => a - b)
      .map((idx) => WEEKDAYS[idx].toString());
    parts.push(`BYDAY=${days.join(",")}`);
  }

  if (form.end.type === "until") {
    parts.push(`UNTIL=${toUntilBasic(form.end.dateMs)}`);
  } else if (form.end.type === "count") {
    parts.push(`COUNT=${form.end.count}`);
  }

  return parts.join(";");
}

/**
 * Parse an RFC5545 RRULE string back into a recurrence form.
 * Returns null when the input is null.
 */
export function parseRRule(rrule: string | null): RecurrenceForm | null {
  if (rrule === null) return null;

  const opts: Partial<Options> = RRule.parseString(rrule);

  const freqEnum = opts.freq;
  const freq: Freq =
    freqEnum !== undefined && ENUM_TO_FREQ[freqEnum] !== undefined
      ? ENUM_TO_FREQ[freqEnum]
      : "WEEKLY";

  const interval = opts.interval && opts.interval > 1 ? opts.interval : 1;

  const byWeekday = normalizeByWeekday(opts.byweekday);

  let end: RecurrenceEnd = { type: "never" };
  if (opts.until != null) {
    end = { type: "until", dateMs: opts.until.getTime() };
  } else if (opts.count != null) {
    end = { type: "count", count: opts.count };
  }

  return { freq, interval, byWeekday, end };
}

const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const FREQ_ADVERB: Record<Freq, string> = {
  DAILY: "daily",
  WEEKLY: "weekly",
  MONTHLY: "monthly",
};
const FREQ_UNIT: Record<Freq, string> = {
  DAILY: "day",
  WEEKLY: "week",
  MONTHLY: "month",
};

/** Short human sentence for a recurrence form, e.g. "Repeats weekly on Mon, Wed, until 30 Jun 2026". */
export function summarizeRecurrence(form: RecurrenceForm): string {
  const hasDays =
    (form.freq === "WEEKLY" || form.freq === "DAILY") && form.byWeekday.length > 0;
  // Daily-with-days has no meaningful interval (see buildRRule): render it plain.
  const showInterval = form.interval > 1 && !(form.freq === "DAILY" && hasDays);

  let out = showInterval
    ? `Repeats every ${form.interval} ${FREQ_UNIT[form.freq]}s`
    : `Repeats ${FREQ_ADVERB[form.freq]}`;

  if (hasDays) {
    const days = [...form.byWeekday]
      .sort((a, b) => a - b)
      .map((i) => WEEKDAY_LABELS[i])
      .join(", ");
    out += ` on ${days}`;
  }

  if (form.end.type === "until") {
    out += `, until ${format(form.end.dateMs, "d MMM yyyy")}`;
  } else if (form.end.type === "count") {
    out += `, ${form.end.count} times`;
  }

  return out;
}

function weekdayToIndex(w: unknown): number | null {
  if (w instanceof Weekday) return w.weekday;
  if (typeof w === "number") return w;
  if (typeof w === "string") {
    const idx = WEEKDAYS.findIndex((d) => d.toString() === w);
    return idx >= 0 ? idx : null;
  }
  if (w && typeof w === "object" && "weekday" in w) {
    const wd = (w as { weekday: unknown }).weekday;
    if (typeof wd === "number") return wd;
  }
  return null;
}

function normalizeByWeekday(
  byweekday: Options["byweekday"] | undefined
): number[] {
  if (byweekday == null) return [];
  const arr = Array.isArray(byweekday) ? byweekday : [byweekday];
  const indices = arr
    .map(weekdayToIndex)
    .filter((n): n is number => n !== null);
  return indices.sort((a, b) => a - b);
}
