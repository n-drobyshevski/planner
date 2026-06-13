import { describe, expect, it } from "vitest";

import { fromNoon, minutesSinceNoon } from "@/lib/sleep/clock";

const UTC = "UTC";

describe("minutesSinceNoon", () => {
  it("anchors at the previous noon so the night span is continuous", () => {
    // 12:00 → 0, 23:00 → 660, 00:00 → 720, 02:00 → 840, 11:59 → 1439
    expect(minutesSinceNoon(Date.UTC(2026, 5, 1, 12, 0), UTC)).toBe(0);
    expect(minutesSinceNoon(Date.UTC(2026, 5, 1, 23, 0), UTC)).toBe(660);
    expect(minutesSinceNoon(Date.UTC(2026, 5, 1, 0, 0), UTC)).toBe(720);
    expect(minutesSinceNoon(Date.UTC(2026, 5, 1, 2, 0), UTC)).toBe(840);
    expect(minutesSinceNoon(Date.UTC(2026, 5, 1, 11, 59), UTC)).toBe(1439);
  });

  it("reads the wall clock in the given zone", () => {
    // 23:00 UTC is 01:00 next day in Berlin (UTC+2 summer) → 13×60 = 780.
    const ms = Date.UTC(2026, 5, 1, 23, 0);
    expect(minutesSinceNoon(ms, "Europe/Berlin")).toBe((1 + 12) * 60);
  });
});

describe("fromNoon", () => {
  it("is the minute-precise inverse of minutesSinceNoon", () => {
    for (const [h, m] of [
      [12, 0],
      [23, 0],
      [0, 0],
      [2, 30],
      [11, 59],
    ] as const) {
      const min = minutesSinceNoon(Date.UTC(2026, 5, 1, h, m), UTC);
      expect(fromNoon(min)).toBe(
        `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`,
      );
    }
  });
});
