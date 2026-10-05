import { describe, it, expect } from "vitest";

import { normalizeRRule, parseDuration, parseIcs, unescapeText } from "@/lib/ical/parse";
import { resolveZone, wallToInstant } from "@/lib/ical/zone";

const cal = (...lines: string[]) => ["BEGIN:VCALENDAR", ...lines, "END:VCALENDAR"].join("\r\n");
const event = (...lines: string[]) => ["BEGIN:VEVENT", ...lines, "END:VEVENT"];
const parse = (text: string, viewerZone = "Europe/Berlin") => parseIcs(text, { viewerZone });

describe("parseIcs", () => {
  it("unfolds lines and unescapes text", () => {
    const { events } = parse(
      cal(...event("DTSTART:20261007T170000Z", "UID:u", "SUMMARY:A long tit", " le", "DESCRIPTION:a\\, b\; c\\nd\\\\n")),
    );
    expect(events[0].title).toBe("A long title");
    expect(events[0].description).toBe("a, b; c\nd\\n");
  });

  it("reads all-day dates as floating UTC midnights with an exclusive end", () => {
    const { events } = parse(cal(...event("DTSTART;VALUE=DATE:20261031", "DTEND;VALUE=DATE:20261102", "UID:t")));
    expect(events[0]).toMatchObject({ allDay: true, start: Date.UTC(2026, 9, 31), end: Date.UTC(2026, 10, 2), timeZone: "Europe/Berlin" });
  });

  it("defaults a missing end to a day (all-day) or an hour (timed)", () => {
    const { events } = parse(cal(...event("DTSTART;VALUE=DATE:20261024", "UID:a"), ...event("DTSTART:20261011T100000", "UID:b")));
    const byUid = Object.fromEntries(events.map((e) => [e.uid, e]));
    expect(byUid.a.end - byUid.a.start).toBe(86_400_000);
    expect(byUid.b.end - byUid.b.start).toBe(3_600_000);
  });

  it("reads TZIDs, Windows zone names and path-style TZIDs", () => {
    const { events } = parse(
      cal(
        ...event('DTSTART;TZID="W. Europe Standard Time":20261013T140000', "UID:w"),
        ...event("DTSTART;TZID=/mozilla.org/20050126_1/Europe/Paris:20261014T080000", "UID:p"),
        ...event("DTSTART;TZID=America/New_York:20261015T080000", "UID:n"),
      ),
    );
    const byUid = Object.fromEntries(events.map((e) => [e.uid, e]));
    expect(byUid.w).toMatchObject({ timeZone: "Europe/Berlin", start: Date.UTC(2026, 9, 13, 12) });
    expect(byUid.p).toMatchObject({ timeZone: "Europe/Paris", start: Date.UTC(2026, 9, 14, 6) });
    expect(byUid.n).toMatchObject({ timeZone: "America/New_York", start: Date.UTC(2026, 9, 15, 12) });
  });

  it("falls back to the viewer's zone for an unknown TZID, with a warning", () => {
    const { events } = parse(cal(...event("DTSTART;TZID=Mars/Olympus:20261013T120000", "UID:m")), "America/Los_Angeles");
    expect(events[0]).toMatchObject({ timeZone: "America/Los_Angeles", warnings: ["zone-unknown"], start: Date.UTC(2026, 9, 13, 19) });
  });

  it("keeps a UTC one-off in the viewer's zone, but a UTC series in UTC", () => {
    const { events } = parse(
      cal(...event("DTSTART:20261007T170000Z", "UID:one"), ...event("DTSTART:20261007T170000Z", "RRULE:FREQ=DAILY;COUNT=2", "UID:series")),
    );
    const byUid = Object.fromEntries(events.map((e) => [e.uid, e]));
    expect(byUid.one.timeZone).toBe("Europe/Berlin");
    expect(byUid.series.timeZone).toBe("UTC");
  });

  it("stores the rule bare with UNTIL in UTC, and EXDATEs as occurrence starts", () => {
    const { events } = parse(
      cal(
        ...event(
          "DTSTART;TZID=Europe/Berlin:20261005T090000",
          "RRULE:FREQ=WEEKLY;BYDAY=MO;UNTIL=20261130T090000",
          "EXDATE;TZID=Europe/Berlin:20261012T090000",
          "EXDATE;VALUE=DATE:20261019",
          "UID:s",
        ),
      ),
    );
    expect(events[0].rrule).toBe("FREQ=WEEKLY;BYDAY=MO;UNTIL=20261130T080000Z");
    expect(events[0].recurrenceEndsAt).toBe(Date.UTC(2026, 10, 30, 8));
    // A date-only EXDATE on a timed series cancels that day's occurrence.
    expect(events[0].exdates).toEqual([Date.UTC(2026, 9, 12, 7), Date.UTC(2026, 9, 19, 7)]);
  });

  it("cancels a replaced occurrence on its series and keeps the replacement as a one-off", () => {
    const { events } = parse(
      cal(
        ...event("DTSTART;TZID=Europe/Berlin:20261005T090000", "RRULE:FREQ=DAILY;COUNT=5", "UID:s", "SUMMARY:Standup"),
        ...event("DTSTART;TZID=Europe/Berlin:20261007T110000", "RECURRENCE-ID;TZID=Europe/Berlin:20261007T090000", "UID:s", "SUMMARY:Moved"),
      ),
    );
    const series = events.find((e) => e.key === "s")!;
    const moved = events.find((e) => e.title === "Moved")!;
    expect(series.exdates).toEqual([Date.UTC(2026, 9, 7, 7)]);
    expect(moved).toMatchObject({ uid: "s#20261007T070000Z", rrule: null, start: Date.UTC(2026, 9, 7, 9) });
  });

  it("imports an unsupported rule as its first occurrence, with a warning", () => {
    const { events } = parse(cal(...event("DTSTART:20261012T090000Z", "RRULE:FREQ=HOURLY;COUNT=3", "UID:h")));
    expect(events[0]).toMatchObject({ rrule: null, warnings: ["rrule-unsupported"] });
  });

  it("maps STATUS, skips VTODO and events without a start, and de-duplicates keys", () => {
    const { events, skipped } = parse(
      cal(
        "BEGIN:VTODO",
        "DTSTART:20261010T090000Z",
        "UID:todo",
        "END:VTODO",
        ...event("DTSTART:20261010T090000Z", "STATUS:TENTATIVE", "UID:x"),
        ...event("DTSTART:20261011T090000Z", "STATUS:CANCELLED", "UID:x"),
        ...event("SUMMARY:no start", "UID:y"),
      ),
    );
    expect(skipped).toBe(1);
    expect(events.map((e) => [e.key, e.status, e.cancelled])).toEqual([
      ["x", "planned", false],
      ["x~2", "confirmed", true],
    ]);
  });

  it("ignores a VALARM's properties", () => {
    const { events } = parse(
      cal(...event("DTSTART:20261007T170000Z", "UID:a", "SUMMARY:Real", "BEGIN:VALARM", "DESCRIPTION:Alarm text", "SUMMARY:Alarm", "END:VALARM")),
    );
    expect(events[0]).toMatchObject({ title: "Real", description: null });
  });
});

describe("helpers", () => {
  it("parse durations", () => {
    expect(parseDuration("PT2H30M")).toBe(9_000_000);
    expect(parseDuration("P1W")).toBe(604_800_000);
    expect(parseDuration("-P1D")).toBe(-86_400_000);
    expect(parseDuration("P")).toBeNull();
    expect(parseDuration("PT")).toBeNull();
  });

  it("normalize rules: date UNTIL on a timed rule ends with that local day", () => {
    expect(normalizeRRule("FREQ=DAILY;UNTIL=20261031", { allDay: false, zone: "Europe/Paris" })).toEqual({
      rrule: "FREQ=DAILY;UNTIL=20261031T225959Z",
      until: Date.UTC(2026, 9, 31, 22, 59, 59),
    });
    expect(normalizeRRule("FREQ=BOGUS", { allDay: false, zone: "UTC" })).toBeNull();
    expect(normalizeRRule("BYDAY=MO", { allDay: false, zone: "UTC" })).toBeNull();
  });

  it("resolve wall times like java.time across DST", () => {
    // Spring gap moves forward; the repeated autumn hour takes the earlier instant.
    expect(wallToInstant("Europe/Berlin", 2026, 3, 29, 2, 30)).toBe(Date.UTC(2026, 2, 29, 1, 30));
    expect(wallToInstant("Europe/Berlin", 2026, 10, 25, 2, 30)).toBe(Date.UTC(2026, 9, 25, 0, 30));
  });

  it("resolve zone names", () => {
    expect(resolveZone("Europe/Berlin")).toBe("Europe/Berlin");
    expect(resolveZone("Russian Standard Time")).toBe("Europe/Moscow");
    expect(resolveZone("Mars/Olympus")).toBeNull();
    expect(unescapeText("a\\Nb")).toBe("a\nb");
  });
});
