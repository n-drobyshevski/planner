import { describe, it, expect } from "vitest";

import { parseIcs } from "@/lib/ical/parse";
import { compileNameFilter, inRange, isDuplicate, selectedByDefault } from "@/lib/ical/review";

const matches = (pattern: string, title: string) => {
  const f = compileNameFilter(pattern);
  return f.ok && f.test(title);
};

describe("compileNameFilter", () => {
  it("matches substrings case-insensitively, globs and regexes anywhere", () => {
    expect(matches("", "anything")).toBe(true);
    expect(matches("STAND", "Daily standup")).toBe(true);
    expect(matches("st*up", "Daily standup")).toBe(true);
    expect(matches("st?ndup", "Standup")).toBe(true);
    expect(matches("a.b", "axb")).toBe(false);
    expect(matches("/^call/", "Call with Sam")).toBe(true);
    expect(matches("/^call/", "A call")).toBe(false);
    expect(matches("ЙОГА", "Утренняя йога")).toBe(true);
  });

  it("reports an invalid regex", () => {
    expect(compileNameFilter("/[oops/")).toEqual({ ok: false, error: "invalid-regex" });
  });
});

describe("review rules", () => {
  const { events } = parseIcs(
    [
      "BEGIN:VCALENDAR",
      "BEGIN:VEVENT", "DTSTART:20261007T170000Z", "DTEND:20261007T180000Z", "UID:one", "SUMMARY:Dentist", "END:VEVENT",
      "BEGIN:VEVENT", "DTSTART;VALUE=DATE:20250315", "RRULE:FREQ=YEARLY", "UID:bday", "SUMMARY:Birthday", "END:VEVENT",
      "BEGIN:VEVENT", "DTSTART:20261001T170000Z", "UID:past", "SUMMARY:Past", "END:VEVENT",
      "BEGIN:VEVENT", "DTSTART:20261009T170000Z", "UID:off", "STATUS:CANCELLED", "SUMMARY:Off", "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n"),
    { viewerZone: "Europe/Berlin" },
  );
  const by = (uid: string) => events.find((e) => e.uid === uid)!;
  const now = Date.UTC(2026, 9, 5, 12);

  it("keep events overlapping a local day range; open series run on", () => {
    expect(inRange(by("one"), { from: "2026-10-07", to: "2026-10-07" }, "Europe/Berlin")).toBe(true);
    expect(inRange(by("one"), { from: "2026-10-08", to: null }, "Europe/Berlin")).toBe(false);
    expect(inRange(by("bday"), { from: "2030-01-01", to: null }, "Europe/Berlin")).toBe(true);
    expect(inRange(by("past"), { from: null, to: "2026-09-30" }, "Europe/Berlin")).toBe(false);
  });

  it("find duplicates by UID or by title and time", () => {
    const one = by("one");
    expect(isDuplicate(one, [{ icalUid: "one", title: "x", start: 0, end: 0 }])).toBe(true);
    expect(isDuplicate(one, [{ icalUid: null, title: " dentist", start: one.start, end: one.end }])).toBe(true);
    expect(isDuplicate(one, [{ icalUid: null, title: "Dentist", start: one.start + 1, end: one.end }])).toBe(false);
  });

  it("start duplicates, cancelled and past events unticked", () => {
    expect(selectedByDefault(by("one"), false, now)).toBe(true);
    expect(selectedByDefault(by("one"), true, now)).toBe(false);
    expect(selectedByDefault(by("off"), false, now)).toBe(false);
    expect(selectedByDefault(by("past"), false, now)).toBe(false);
    expect(selectedByDefault(by("bday"), false, now)).toBe(true);
  });
});
