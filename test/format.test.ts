import { describe, it, expect } from "vitest";
import {
  formatRangeLabel,
  formatOccurrenceWhen,
  parseViewParam,
  isCalendarViewParam,
} from "@/lib/datetime/format";

describe("formatOccurrenceWhen", () => {
  // June 1 2026 is a Monday. Local Date construction keeps these tz-stable.
  it("all-day single day", () => {
    const start = new Date(2026, 5, 1).getTime();
    const end = new Date(2026, 5, 2).getTime();
    expect(formatOccurrenceWhen(start, end, true)).toBe("Mon, Jun 1 · All day");
  });

  it("all-day multi day (exclusive end)", () => {
    const start = new Date(2026, 5, 1).getTime();
    const end = new Date(2026, 5, 5).getTime();
    expect(formatOccurrenceWhen(start, end, true)).toBe("Jun 1 – Jun 4");
  });

  it("timed within one day", () => {
    const start = new Date(2026, 5, 1, 9, 0).getTime();
    const end = new Date(2026, 5, 1, 9, 30).getTime();
    expect(formatOccurrenceWhen(start, end, false)).toBe("Mon, Jun 1 · 9:00 – 9:30 AM");
  });

  it("timed across midnight", () => {
    const start = new Date(2026, 5, 1, 23, 0).getTime();
    const end = new Date(2026, 5, 2, 1, 0).getTime();
    expect(formatOccurrenceWhen(start, end, false)).toBe("Jun 1, 11:00 PM – Jun 2, 1:00 AM");
  });
});

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
