import { describe, it, expect } from "vitest";
import {
  formatRangeLabel,
  parseViewParam,
  isCalendarViewParam,
} from "@/lib/datetime/format";

// May 31 2026 is a Sunday; default week start is Monday (weekStartsOn=1).
// Strings depend only on the local calendar date, so they are timezone-stable.
const focused = new Date(2026, 4, 31, 15, 30, 45, 123).getTime();

describe("formatRangeLabel", () => {
  it("day view shows the full weekday + date", () => {
    expect(formatRangeLabel("day", focused)).toBe("Sunday, May 31, 2026");
  });

  it("month view shows month + year", () => {
    expect(formatRangeLabel("month", focused)).toBe("May 2026");
  });

  it("week view spans Mon–Sun of the focused week (unchanged)", () => {
    expect(formatRangeLabel("week", focused)).toBe("May 25 – 31, 2026");
  });

  it("3day view spans exactly the focused day → +2 days, crossing the month", () => {
    expect(formatRangeLabel("3day", focused)).toBe("May 31 – Jun 2, 2026");
  });
});

describe("isCalendarViewParam / parseViewParam", () => {
  it("accepts all valid views, including 3day and agenda", () => {
    for (const v of ["month", "week", "day", "3day", "agenda"]) {
      expect(isCalendarViewParam(v)).toBe(true);
    }
  });

  it("rejects unknown or missing params", () => {
    expect(isCalendarViewParam("year")).toBe(false);
    expect(isCalendarViewParam(undefined)).toBe(false);
  });

  it("parseViewParam preserves 3day and falls back to week otherwise", () => {
    expect(parseViewParam("3day")).toBe("3day");
    expect(parseViewParam("nope")).toBe("week");
    expect(parseViewParam(undefined)).toBe("week");
  });
});
