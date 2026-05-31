import type { Occurrence } from "@/lib/types";

const DAY_MS = 86_400_000;

export interface MonthItem {
  occ: Occurrence;
  colStart: number; // 0..6 within the week
  colEnd: number; // 0..6 inclusive
  lane: number;
  isBar: boolean; // all-day or multi-day -> spanning bar; else single-day chip
}

export interface WeekLayout {
  items: MonthItem[]; // items whose lane < maxLanes (visible)
  overflow: number[]; // per-column (0..6) count of hidden items
}

/** Column (0..6) a timestamp falls into, using the week's day boundaries (DST-safe). */
function colOf(ms: number, dayStarts: number[], weekEnd: number): number {
  if (ms < dayStarts[0]) return 0;
  for (let i = 0; i < 7; i++) {
    const next = i < 6 ? dayStarts[i + 1] : weekEnd;
    if (ms < next) return i;
  }
  return 6;
}

/**
 * Lane-pack one week's occurrences for the month grid. Bars (all-day/multi-day)
 * are placed first (longest first) so they form continuous rows; single-day
 * timed chips fill the remaining lanes. Items beyond `maxLanes` become per-day
 * overflow counts surfaced as "+N more".
 */
export function packMonthWeek(
  occurrences: Occurrence[],
  dayStarts: number[],
  maxLanes: number,
): WeekLayout {
  const weekStart = dayStarts[0];
  const weekEnd = dayStarts[6] + DAY_MS;

  const entries = occurrences
    .filter((o) => o.start < weekEnd && o.end > weekStart)
    .map((o) => {
      const colStart = colOf(Math.max(o.start, weekStart), dayStarts, weekEnd);
      const colEnd = colOf(Math.min(o.end - 1, weekEnd - 1), dayStarts, weekEnd);
      const isBar = o.allDay || colEnd > colStart;
      return { occ: o, colStart, colEnd, isBar };
    });

  // Bars first (longest first), then chips by start time. Stable, deterministic.
  entries.sort((a, b) => {
    if (a.isBar !== b.isBar) return a.isBar ? -1 : 1;
    if (a.isBar && b.isBar) {
      const lenDiff = b.colEnd - b.colStart - (a.colEnd - a.colStart);
      if (lenDiff !== 0) return lenDiff;
    }
    return a.occ.start - b.occ.start || a.colStart - b.colStart;
  });

  const laneOccupied: boolean[][] = [];
  const items: MonthItem[] = [];
  const overflow = [0, 0, 0, 0, 0, 0, 0];

  for (const e of entries) {
    let lane = 0;
    for (;;) {
      if (!laneOccupied[lane]) laneOccupied[lane] = new Array(7).fill(false);
      let free = true;
      for (let c = e.colStart; c <= e.colEnd; c++) {
        if (laneOccupied[lane][c]) {
          free = false;
          break;
        }
      }
      if (free) break;
      lane++;
    }
    for (let c = e.colStart; c <= e.colEnd; c++) laneOccupied[lane][c] = true;

    if (lane < maxLanes) {
      items.push({ occ: e.occ, colStart: e.colStart, colEnd: e.colEnd, lane, isBar: e.isBar });
    } else {
      for (let c = e.colStart; c <= e.colEnd; c++) overflow[c]++;
    }
  }

  return { items, overflow };
}

/** Occurrences intersecting a single day [dayStart, dayStart+1d). */
export function occurrencesOnDay(occurrences: Occurrence[], dayStart: number): Occurrence[] {
  const dayEnd = dayStart + DAY_MS;
  return occurrences
    .filter((o) => o.start < dayEnd && o.end > dayStart)
    .sort((a, b) => Number(b.allDay) - Number(a.allDay) || a.start - b.start);
}
