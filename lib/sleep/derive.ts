// Derive nightly sleep sessions from inactive calendar events.
//
// Candidates are timed event occurrences. By default only inactive ones count
// (`inactive && !allDay && kind === "event"`) — at couples scale, inactive ≡
// sleep; a 21:00 inactive "focus block" would be miscounted. Callers with a
// dedicated sleep category pass `preFiltered: true` and own the criterion.
// The lib is viewer-agnostic: callers pre-filter to one member's occurrences.
//
// Each requested day gets one DerivedNight, attributed to its WAKE date: the
// night window is [previous day `startHour`, wake day `endHour`) wall-clock
// in `timeZone` (defaults 20:00 → 12:00), built via TZDate so DST nights
// (Berlin fall-back 25h / spring-forward 23h) keep their wall boundaries. Spans are clipped to the
// window, sorted and merged with a touching rule, then grouped into clusters
// whose internal gaps are ≤ NIGHT_GAP_TOLERANCE — the night is the cluster
// with the most sleep. So a split night with brief wake-ups counts fully
// (gaps stay awake time), while a disconnected inactive block — a morning
// commute, an evening wind-down — never reads as sleep.
//
// Known limitations: sleep past `endHour` is clipped; the first night of a
// window can lose a pre-midnight chunk that ended before the window start
// (such rows are never fetched — see fetchWindow's lower bound).

import { TZDate } from "@date-fns/tz";

import { dateKeyInZone } from "@/lib/datetime/local";
import type { Occurrence } from "@/lib/types";

export interface DerivedNight {
  /** wake date "yyyy-MM-dd" in `timeZone` */
  dateKey: string;
  /** the wake day's local day-start (chart x-axis key) */
  dayStartMs: number;
  /** first merged block start (bedtime); null = no data */
  start: number | null;
  /** last merged block end (wake); null = no data */
  end: number | null;
  /** SUM of merged in-window blocks; 0 = missing night */
  durationMs: number;
}

const NIGHT_START_HOUR = 20; // previous day, local
const NIGHT_END_HOUR = 12; // wake day, local
/** A gap this short between blocks reads as a brief wake-up, not a day break. */
const NIGHT_GAP_TOLERANCE_MS = 45 * 60_000;

export interface DeriveOptions {
  /** Night window start on the evening before, wall hour (default 20). */
  startHour?: number;
  /** Night window end on the wake day, wall hour (default 12). */
  endHour?: number;
  /**
   * When true the caller already chose what counts as sleep (e.g. a dedicated
   * sleep category) and every timed event passed in qualifies; otherwise only
   * inactive ones do (the historical inactive≡sleep heuristic).
   */
  preFiltered?: boolean;
}

export function deriveNights(
  occurrences: Occurrence[],
  days: number[],
  timeZone: string,
  opts: DeriveOptions = {},
): DerivedNight[] {
  const startHour = opts.startHour ?? NIGHT_START_HOUR;
  const endHour = opts.endHour ?? NIGHT_END_HOUR;
  const candidates = occurrences
    .filter(
      (o) => (opts.preFiltered || o.inactive) && !o.allDay && o.kind === "event",
    )
    .sort((a, b) => a.start - b.start);

  return days.map((dayStartMs) => {
    const dateKey = dateKeyInZone(dayStartMs, timeZone);
    const [y, mo, d] = dateKey.split("-").map(Number);
    // TZDate normalizes out-of-range days (d − 1 may roll into the previous
    // month), and wall-clock 20:00/12:00 stay put across DST transitions.
    const winStart = new TZDate(y, mo - 1, d - 1, startHour, 0, 0, timeZone).getTime();
    const winEnd = new TZDate(y, mo - 1, d, endHour, 0, 0, timeZone).getTime();

    // Clip to the window and merge overlapping/touching spans into blocks.
    const blocks: { start: number; end: number }[] = [];
    for (const o of candidates) {
      const s = Math.max(o.start, winStart);
      const e = Math.min(o.end, winEnd);
      if (e <= s) continue; // outside the night window
      const last = blocks[blocks.length - 1];
      if (last && s <= last.end) {
        last.end = Math.max(last.end, e);
      } else {
        blocks.push({ start: s, end: e });
      }
    }

    // Group blocks into clusters across short gaps; the night is the cluster
    // with the most sleep (ties → the earlier one).
    let best: { start: number; end: number; ms: number } | null = null;
    let cur: { start: number; end: number; ms: number } | null = null;
    for (const b of blocks) {
      if (cur && b.start - cur.end <= NIGHT_GAP_TOLERANCE_MS) {
        cur.end = b.end;
        cur.ms += b.end - b.start;
      } else {
        cur = { start: b.start, end: b.end, ms: b.end - b.start };
      }
      if (best === null || cur.ms > best.ms) best = cur;
    }

    return {
      dateKey,
      dayStartMs,
      start: best?.start ?? null,
      end: best?.end ?? null,
      durationMs: best?.ms ?? 0,
    };
  });
}
