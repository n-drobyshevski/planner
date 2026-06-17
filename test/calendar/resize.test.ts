import { describe, it, expect } from "vitest";
import { resizeOccurrence, resizePreviewSegment } from "@/lib/calendar/resize";

const DAY_MS = 86_400_000;
const SLOT = 15;
// A 3-day window: day 0, day 1, day 2 (local midnights, arbitrary epoch base).
const D0 = 1_700_000_000_000 - (1_700_000_000_000 % DAY_MS); // midnight-aligned
const days = [D0, D0 + DAY_MS, D0 + 2 * DAY_MS];
const at = (dayIdx: number, h: number, m = 0) =>
  days[dayIdx] + (h * 60 + m) * 60_000;

describe("resizeOccurrence — single day", () => {
  it("drags the bottom edge later", () => {
    const r = resizeOccurrence(at(0, 9), at(0, 10), "end", at(0, 11), SLOT);
    expect(r).toEqual({ start: at(0, 9), end: at(0, 11) });
  });
  it("drags the top edge earlier", () => {
    const r = resizeOccurrence(at(0, 9), at(0, 10), "start", at(0, 8), SLOT);
    expect(r).toEqual({ start: at(0, 8), end: at(0, 10) });
  });
  it("clamps the bottom edge to a minimum height", () => {
    const r = resizeOccurrence(at(0, 9), at(0, 10), "end", at(0, 8), SLOT);
    expect(r.end).toBe(at(0, 9) + SLOT * 60_000);
  });
});

describe("resizeOccurrence — sleep crossing midnight (the bug)", () => {
  // Sleep: 23:00 on day 0 → 07:00 on day 1.
  const start = at(0, 23);
  const end = at(1, 7);

  it("extends wake time later into the next day", () => {
    // Grab the morning block's bottom edge (in day-1 column) and drag to 08:00.
    const r = resizeOccurrence(start, end, "end", at(1, 8), SLOT);
    expect(r).toEqual({ start, end: at(1, 8) });
  });

  it("pulls wake time earlier, still on the next day", () => {
    const r = resizeOccurrence(start, end, "end", at(1, 6), SLOT);
    expect(r).toEqual({ start, end: at(1, 6) });
  });

  it("moves bedtime earlier on the first day, leaving wake untouched", () => {
    const r = resizeOccurrence(start, end, "start", at(0, 22), SLOT);
    expect(r).toEqual({ start: at(0, 22), end });
  });

  it("never lets wake collapse before bedtime + minimum", () => {
    const r = resizeOccurrence(start, end, "end", at(0, 12), SLOT);
    expect(r.end).toBe(start + SLOT * 60_000);
  });
});

describe("resizePreviewSegment", () => {
  it("previews a single-day event in its own column", () => {
    const seg = resizePreviewSegment(at(0, 9), at(0, 11), "end", days, DAY_MS);
    expect(seg).toEqual({ dayIndex: 0, topMin: 9 * 60, heightMin: 2 * 60 });
  });

  it("previews the morning segment in the next column for a bottom drag", () => {
    // 23:00 day0 → 08:00 day1, dragging the end: preview is the day-1 segment.
    const seg = resizePreviewSegment(at(0, 23), at(1, 8), "end", days, DAY_MS);
    expect(seg).toEqual({ dayIndex: 1, topMin: 0, heightMin: 8 * 60 });
  });

  it("previews the evening segment in the start column for a top drag", () => {
    // 22:00 day0 → 07:00 day1, dragging the start: preview is the day-0 segment.
    const seg = resizePreviewSegment(at(0, 22), at(1, 7), "start", days, DAY_MS);
    expect(seg).toEqual({ dayIndex: 0, topMin: 22 * 60, heightMin: 2 * 60 });
  });

  it("treats a midnight end as the bottom of the day that just ended", () => {
    const seg = resizePreviewSegment(at(0, 23), at(1, 0), "end", days, DAY_MS);
    expect(seg).toEqual({ dayIndex: 0, topMin: 23 * 60, heightMin: 60 });
  });
});
