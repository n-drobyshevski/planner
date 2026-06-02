import { describe, it, expect } from "vitest";
import { defaultStartOnDay, ceilToStep, localTimeZone } from "@/lib/datetime/local";
import { startOfDay, getTime } from "date-fns";

// Use the host zone so the host-local `startOfDay` fixtures below line up with
// defaultStartOnDay's zone-aware "is today?" check.
const TZ = localTimeZone();

describe("defaultStartOnDay", () => {
  it("when the target day is today, uses the next 30-min slot from now", () => {
    const now = new Date(2026, 5, 1, 9, 12, 0).getTime(); // 09:12 today
    const today = getTime(startOfDay(now));
    expect(defaultStartOnDay(today, TZ, now)).toBe(ceilToStep(now, 30)); // -> 09:30
  });

  it("when the target day is not today, uses 9:00 on that day", () => {
    const now = new Date(2026, 5, 1, 9, 12, 0).getTime();
    const otherDay = getTime(startOfDay(new Date(2026, 5, 8).getTime())); // a week later
    expect(defaultStartOnDay(otherDay, TZ, now)).toBe(otherDay + 9 * 3_600_000);
  });

  it("late at night today still uses the next slot (not the 9:00 fallback)", () => {
    const now = new Date(2026, 5, 1, 23, 50, 0).getTime(); // 23:50 today
    const today = getTime(startOfDay(now));
    const result = defaultStartOnDay(today, TZ, now);
    expect(result).toBe(ceilToStep(now, 30)); // next 30-min slot
    expect(result).toBeGreaterThan(now); // forward in time...
    expect(result).not.toBe(today + 9 * 3_600_000); // ...not the past 9:00 slot
  });

  it("defaults `now` to the current time when omitted", () => {
    // A day far in the past is never "today", so it always takes the 9:00 branch.
    const longAgo = getTime(startOfDay(new Date(2000, 0, 1).getTime()));
    expect(defaultStartOnDay(longAgo)).toBe(longAgo + 9 * 3_600_000);
  });
});
