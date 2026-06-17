import { describe, it, expect } from "vitest";
import { movedStartTotal, previewSegments, shiftedMemberStart } from "@/lib/calendar/move";

const DAY = 1440;
const DAYS = 3; // a 3-column window
const hm = (h: number, m = 0) => h * 60 + m;
// Total grid-minutes for (day, h:m).
const at = (day: number, h: number, m = 0) => day * DAY + hm(h, m);

describe("movedStartTotal", () => {
  it("places the start under the pointer, minus the grab offset, snapped", () => {
    // Grabbed 30 min below the start; pointer now at day1 09:10 → start 08:40,
    // snapped to 08:45.
    const start = movedStartTotal(at(1, 9, 10), 30, DAYS);
    expect(start).toBe(at(1, 8, 45));
  });

  it("lets a long (sleep) block be dropped at night — no single-day clamp", () => {
    // 8h block, grabbed at its very top (offset 0), pointer at day1 23:00.
    const start = movedStartTotal(at(1, 23), 0, DAYS);
    expect(start).toBe(at(1, 23)); // would have been clamped to 16:00 before
  });

  it("keeps the start on a visible column", () => {
    expect(movedStartTotal(at(99, 0), 0, DAYS)).toBe(DAYS * DAY - 15);
    expect(movedStartTotal(-99999, 0, DAYS)).toBe(0);
  });

  it("resolves the grab offset correctly when the morning segment is grabbed", () => {
    // Sleep starts day0 23:00. Its morning point day1 03:00 is 4h after start.
    const startTotal = at(0, 23);
    const grabOffset = at(1, 3) - startTotal; // 240 min
    // Drag that morning point to day2 04:00 → start = day2 04:00 − 4h = day2 00:00.
    const start = movedStartTotal(at(2, 4), grabOffset, DAYS);
    expect(start).toBe(at(2, 0));
  });
});

describe("previewSegments", () => {
  it("returns one segment for a same-day block", () => {
    expect(previewSegments(at(0, 9), 120, DAYS)).toEqual([
      { dayIndex: 0, topMin: hm(9), heightMin: 120 },
    ]);
  });

  it("splits a cross-midnight block into two clipped segments", () => {
    // day0 23:00 → day1 07:00 (8h).
    expect(previewSegments(at(0, 23), 8 * 60, DAYS)).toEqual([
      { dayIndex: 0, topMin: hm(23), heightMin: 60 }, // 23:00 → midnight
      { dayIndex: 1, topMin: 0, heightMin: 7 * 60 }, // midnight → 07:00
    ]);
  });

  it("drops segments past the last visible column", () => {
    // Starts in the last column and would spill off-grid.
    const segs = previewSegments(at(2, 23), 4 * 60, DAYS);
    expect(segs).toEqual([{ dayIndex: 2, topMin: hm(23), heightMin: 60 }]);
  });
});

describe("shiftedMemberStart", () => {
  it("applies the same total delta to a member, rolling across midnight", () => {
    // Member at day1 23:00, group shifted +2h → day2 01:00.
    expect(shiftedMemberStart(at(1, 23), 120, DAYS)).toBe(at(2, 1));
  });
  it("clamps to the visible grid", () => {
    expect(shiftedMemberStart(at(0, 0), -100, DAYS)).toBe(0);
  });
});
