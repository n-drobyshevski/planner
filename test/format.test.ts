import { describe, it, expect } from "vitest";
import {
  formatRangeLabel,
  formatOccurrenceWhen,
  formatTime,
  formatDayMonth,
  formatWeekdayDayMonth,
  formatDayMonthYear,
  parseViewParam,
  isCalendarViewParam,
} from "@/lib/datetime/format";

describe("formatOccurrenceWhen", () => {
  // June 1 2026 is a Monday. Local Date construction keeps these tz-stable.
  it("all-day single day", () => {
    const start = new Date(2026, 5, 1).getTime();
    const end = new Date(2026, 5, 2).getTime();
    expect(formatOccurrenceWhen(start, end, true)).toBe("Mon, 1 Jun · All day");
  });

  it("all-day multi day (exclusive end)", () => {
    const start = new Date(2026, 5, 1).getTime();
    const end = new Date(2026, 5, 5).getTime();
    expect(formatOccurrenceWhen(start, end, true)).toBe("1 Jun – 4 Jun");
  });

  it("timed within one day", () => {
    const start = new Date(2026, 5, 1, 9, 0).getTime();
    const end = new Date(2026, 5, 1, 9, 30).getTime();
    expect(formatOccurrenceWhen(start, end, false)).toBe("Mon, 1 Jun · 09:00 – 09:30");
  });

  it("timed across midnight", () => {
    const start = new Date(2026, 5, 1, 23, 0).getTime();
    const end = new Date(2026, 5, 2, 1, 0).getTime();
    expect(formatOccurrenceWhen(start, end, false)).toBe("1 Jun, 23:00 – 2 Jun, 01:00");
  });
});

// May 31 2026 is a Sunday; default week start is Monday (weekStartsOn=1).
// Strings depend only on the local calendar date, so they are timezone-stable.
const focused = new Date(2026, 4, 31, 15, 30, 45, 123).getTime();

describe("formatRangeLabel", () => {
  it("day view shows the full weekday + date", () => {
    expect(formatRangeLabel("day", focused)).toBe("Sunday, 31 May 2026");
  });

  it("month view shows month + year", () => {
    expect(formatRangeLabel("month", focused)).toBe("May 2026");
  });

  it("week view spans Mon–Sun of the focused week (unchanged)", () => {
    expect(formatRangeLabel("week", focused)).toBe("25 – 31 May 2026");
  });

  it("3day view spans exactly the focused day → +2 days, crossing the month", () => {
    expect(formatRangeLabel("3day", focused)).toBe("31 May – 2 Jun 2026");
  });

  it("week range spanning a year boundary shows both months and the end year", () => {
    // Week of Thu 31 Dec 2026 → Mon 28 Dec 2026 … Sun 3 Jan 2027.
    expect(formatRangeLabel("week", new Date(2026, 11, 31).getTime())).toBe(
      "28 Dec – 3 Jan 2027",
    );
  });
});

describe("formatters", () => {
  it("formatTime is 24-hour HH:mm", () => {
    expect(formatTime(new Date(2026, 5, 1, 9, 0).getTime())).toBe("09:00");
    expect(formatTime(new Date(2026, 5, 1, 18, 5).getTime())).toBe("18:05");
  });
  it("formatDayMonth is day-before-month", () => {
    expect(formatDayMonth(new Date(2026, 5, 1).getTime())).toBe("1 Jun");
    expect(formatDayMonth(new Date(2026, 5, 15).getTime())).toBe("15 Jun");
  });
  it("formatWeekdayDayMonth", () => {
    expect(formatWeekdayDayMonth(new Date(2026, 5, 1).getTime())).toBe("Mon, 1 Jun");
    expect(formatWeekdayDayMonth(new Date(2026, 5, 15).getTime())).toBe("Mon, 15 Jun");
  });
  it("formatDayMonthYear", () => {
    expect(formatDayMonthYear(new Date(2026, 5, 1).getTime())).toBe("1 Jun 2026");
    expect(formatDayMonthYear(new Date(2026, 5, 15).getTime())).toBe("15 Jun 2026");
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
