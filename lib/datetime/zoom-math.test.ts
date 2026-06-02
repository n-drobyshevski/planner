import { describe, it, expect } from "vitest";
import { yToMinutes } from "./grid-math";
import {
  DEFAULT_HOUR_PX,
  MIN_HOUR_PX,
  MAX_HOUR_PX,
  clampHourPx,
  zoomAtCursor,
  pinchDistance,
  pinchMidpointY,
} from "./zoom-math";

describe("clampHourPx", () => {
  it("passes in-range values through", () => {
    expect(clampHourPx(48)).toBe(48);
    expect(clampHourPx(100)).toBe(100);
  });
  it("clamps to the zoom bounds", () => {
    expect(clampHourPx(MIN_HOUR_PX - 10)).toBe(MIN_HOUR_PX);
    expect(clampHourPx(MAX_HOUR_PX + 500)).toBe(MAX_HOUR_PX);
  });
  it("falls back to the default for non-finite input", () => {
    expect(clampHourPx(Number.NaN)).toBe(DEFAULT_HOUR_PX);
    expect(clampHourPx(Number.POSITIVE_INFINITY)).toBe(DEFAULT_HOUR_PX);
  });
});

describe("zoomAtCursor", () => {
  // The defining property: the content-minute under the cursor is unchanged by
  // a zoom step (as long as the result doesn't hit the scrollTop=0 floor).
  const cases = [
    { oldHourPx: 48, factor: 1.5, scrollTop: 200, cursorOffsetY: 120 },
    { oldHourPx: 48, factor: 0.7, scrollTop: 600, cursorOffsetY: 50 },
    { oldHourPx: 64, factor: 1.25, scrollTop: 360, cursorOffsetY: 300 },
  ];
  for (const c of cases) {
    it(`keeps the anchored minute (factor ${c.factor})`, () => {
      const before = yToMinutes(c.scrollTop + c.cursorOffsetY, c.oldHourPx);
      const { hourPx, scrollTop } = zoomAtCursor(c);
      const after = yToMinutes(scrollTop + c.cursorOffsetY, hourPx);
      expect(after).toBeCloseTo(before, 6);
    });
  }

  it("clamps the scale and keeps scrollTop non-negative", () => {
    const r = zoomAtCursor({ oldHourPx: 48, factor: 100, scrollTop: 100, cursorOffsetY: 40 });
    expect(r.hourPx).toBe(MAX_HOUR_PX);
    expect(r.scrollTop).toBeGreaterThanOrEqual(0);
  });

  it("floors scrollTop at 0 when the anchor sits near the top", () => {
    const r = zoomAtCursor({ oldHourPx: 48, factor: 0.5, scrollTop: 0, cursorOffsetY: 10 });
    expect(r.scrollTop).toBe(0);
  });
});

describe("pinch helpers", () => {
  it("computes distance and vertical midpoint", () => {
    const a = { clientX: 0, clientY: 0 };
    const b = { clientX: 3, clientY: 4 };
    expect(pinchDistance(a, b)).toBe(5);
    expect(pinchMidpointY(a, b)).toBe(2);
  });
});
