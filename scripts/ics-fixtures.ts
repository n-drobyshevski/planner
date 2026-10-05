/**
 * Golden fixtures for the .ics import (lib/ical/*), replayed by the Kotlin
 * port's tests (android/core/ical IcsFixturesTest). Sections:
 * - parse: every sample file in test/fixtures/ics under one or more viewer
 *   zones → the full parse result (events + skipped);
 * - names: name-filter patterns × titles → ok/match;
 * - ranges: parsed events × day ranges → inRange;
 * - duplicates: an event against existing rows → isDuplicate;
 * - defaults: parsed events at a fixed "now" → selectedByDefault.
 * Everything is computed from the real lib/ical code, so the drift guard
 * (test/ics-fixtures.test.ts) fails until `pnpm fixtures:ics` is re-run.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { parseIcs, type IcsEvent, type IcsParseResult } from "@/lib/ical/parse";
import {
  compileNameFilter,
  inRange,
  isDuplicate,
  selectedByDefault,
  type DayRange,
  type ExistingEvent,
} from "@/lib/ical/review";

export const ICS_FIXTURES_PATH = "android/core/ical/src/test/resources/ics-fixtures.json";
const SAMPLES_DIR = "test/fixtures/ics";

const PARSE_CASES: { file: string; zones: string[] }[] = [
  { file: "google.ics", zones: ["Europe/Berlin", "Asia/Kolkata"] },
  { file: "outlook.ics", zones: ["Europe/Berlin"] },
  { file: "apple.ics", zones: ["Europe/Berlin", "America/Los_Angeles"] },
  { file: "edge.ics", zones: ["Europe/Berlin", "America/Los_Angeles"] },
];

const PATTERNS = ["", "stand", "STAND", "*up", "stand?p", "team*review", "/^call/", "/[unclosed/", "йог", "ЙОГА", "/йо.а/", "Й*А", "a.b", "*", "?", "(sf)", "/\\(SF\\)$/"];
const TITLES = ["Standup", "Standup (moved)", "Team review", "Call with Sam (SF)", "Йога", "a.b test", "axb test", ""];

const RANGES: DayRange[] = [
  { from: null, to: null },
  { from: "2026-10-08", to: null },
  { from: null, to: "2026-10-06" },
  { from: "2026-10-20", to: "2026-10-25" },
  { from: "2026-11-01", to: "2026-11-01" },
  { from: "2026-12-03", to: "2026-12-03" },
];

const NOW = Date.UTC(2026, 9, 5, 12, 0, 0);

export interface IcsFixtures {
  parse: { name: string; file: string; viewerZone: string; text: string; result: IcsParseResult }[];
  names: { name: string; pattern: string; title: string; ok: boolean; match: boolean }[];
  ranges: { name: string; parse: string; key: string; from: string | null; to: string | null; expected: boolean }[];
  duplicates: { name: string; event: IcsEvent; existing: ExistingEvent[]; expected: boolean }[];
  defaults: { name: string; parse: string; key: string; duplicate: boolean; now: number; expected: boolean }[];
}

export function buildIcsFixtures(): IcsFixtures {
  const parse: IcsFixtures["parse"] = [];
  for (const { file, zones } of PARSE_CASES) {
    const text = readFileSync(path.resolve(process.cwd(), SAMPLES_DIR, file), "utf8");
    for (const viewerZone of zones) {
      parse.push({ name: `${file}@${viewerZone}`, file, viewerZone, text, result: parseIcs(text, { viewerZone }) });
    }
  }

  const names: IcsFixtures["names"] = [];
  for (const pattern of PATTERNS) {
    const filter = compileNameFilter(pattern);
    for (const title of TITLES) {
      names.push({
        name: `${JSON.stringify(pattern)} ~ ${JSON.stringify(title)}`,
        pattern,
        title,
        ok: filter.ok,
        match: filter.ok ? filter.test(title) : false,
      });
    }
  }

  const ranges: IcsFixtures["ranges"] = [];
  const defaults: IcsFixtures["defaults"] = [];
  for (const p of parse) {
    for (const event of p.result.events) {
      for (const range of RANGES) {
        ranges.push({
          name: `${p.name} ${event.key} [${range.from ?? "…"}, ${range.to ?? "…"}]`,
          parse: p.name,
          key: event.key,
          from: range.from,
          to: range.to,
          expected: inRange(event, range, p.viewerZone),
        });
      }
      for (const duplicate of [false, true]) {
        defaults.push({
          name: `${p.name} ${event.key} dup=${duplicate}`,
          parse: p.name,
          key: event.key,
          duplicate,
          now: NOW,
          expected: selectedByDefault(event, duplicate, NOW),
        });
      }
    }
  }

  const sample = parse[0].result.events.find((e) => e.key === "dentist-789@google.com")!;
  const noUid = parse.find((p) => p.file === "edge.ics")!.result.events.find((e) => e.uid === null)!;
  const duplicateCases: [string, IcsEvent, ExistingEvent[]][] = [
    ["same uid, other time", sample, [{ icalUid: sample.uid, title: "Other", start: 0, end: 1 }]],
    ["same title and time, no uid", sample, [{ icalUid: null, title: "  dentist ", start: sample.start, end: sample.end }]],
    ["same title, other end", sample, [{ icalUid: null, title: "Dentist", start: sample.start, end: sample.end + 1 }]],
    ["other title, same time", sample, [{ icalUid: null, title: "Dentists", start: sample.start, end: sample.end }]],
    ["nothing existing", sample, []],
    ["no uid in file, other uid existing", noUid, [{ icalUid: "x", title: "No UID here", start: noUid.start, end: noUid.end }]],
    ["no uid never matches a null uid", noUid, [{ icalUid: null, title: "Something", start: 1, end: 2 }]],
    ["whitespace collapses", sample, [{ icalUid: null, title: "DENTIST", start: sample.start, end: sample.end }]],
  ];
  const duplicates = duplicateCases.map(([name, event, existing]) => ({
    name,
    event,
    existing,
    expected: isDuplicate(event, existing),
  }));

  return { parse, names, ranges, duplicates, defaults };
}

/** Stable, diff-friendly JSON (2-space indent, trailing newline). */
export function serializeIcsFixtures(f: IcsFixtures): string {
  return `${JSON.stringify(f, null, 2)}\n`;
}
