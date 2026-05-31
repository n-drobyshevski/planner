// Pure helpers for turning a task into calendar block(s). Times in epoch ms,
// durations in minutes. No I/O.

export interface Segment {
  start: number;
  end: number;
}

const MIN = 60_000;

/**
 * Split a total duration into `count` equal, contiguous blocks starting at
 * `startMs`. Used by the Schedule dialog's "split into N blocks". Boundaries are
 * computed from the exact total so blocks always tile [startMs, startMs+total).
 */
export function splitIntoBlocks(
  startMs: number,
  totalMin: number,
  count: number,
): Segment[] {
  if (count <= 0 || totalMin <= 0) return [];
  const totalMs = totalMin * MIN;
  const segs: Segment[] = [];
  for (let i = 0; i < count; i++) {
    const start = Math.round(startMs + (i * totalMs) / count);
    const end = Math.round(startMs + ((i + 1) * totalMs) / count);
    segs.push({ start, end });
  }
  return segs;
}

/**
 * Lay blocks end-to-end from `startMs`, one per duration (minutes). Used to
 * schedule sequential subtasks back-to-back. Non-positive durations are skipped.
 */
export function backToBack(startMs: number, durationsMin: number[]): Segment[] {
  const segs: Segment[] = [];
  let cursor = startMs;
  for (const d of durationsMin) {
    if (d <= 0) continue;
    const end = cursor + d * MIN;
    segs.push({ start: cursor, end });
    cursor = end;
  }
  return segs;
}
