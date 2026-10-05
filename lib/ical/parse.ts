// .ics (RFC 5545) → Planr event drafts, for the import review. Pure and
// isomorphic; the Android port (:core:ical IcsParser) replays this module's
// golden fixtures (pnpm fixtures:ics), so any change here must keep them in
// step.
//
// Only VEVENTs are read (VTODO/VJOURNAL/VALARM are skipped; VTIMEZONE isn't
// needed: TZIDs resolve to IANA zones, Windows names included). Times follow
// Planr's storage: all-day events are floating dates on UTC midnights with an
// exclusive end (exactly iCalendar's VALUE=DATE semantics); timed events are
// instants plus the zone their recurrence expands in. Rules are stored bare
// (no DTSTART / "RRULE:"), UNTIL in UTC. EXDATEs and RECURRENCE-ID
// replacements become the occurrence instants to cancel on the series.

import { RRule } from "rrule";
import { resolveZone, wallToInstant } from "./zone";

const DAY = 86_400_000;
const HOUR = 3_600_000;

export type IcsWarning =
  /** A TZID that names no zone we know: read in the viewer's zone. */
  | "zone-unknown"
  /** A repeat rule Planr can't expand: imported as its first occurrence only. */
  | "rrule-unsupported"
  /** RDATE (extra dates) isn't supported: only the rule's dates import. */
  | "rdate-ignored";

export interface IcsEvent {
  /** Unique within the file (UID, a replaced occurrence's UID#date, or #index). */
  key: string;
  /** What duplicate detection matches on, kept on the event as attributes.icalUid. */
  uid: string | null;
  title: string;
  description: string | null;
  location: string | null;
  allDay: boolean;
  /** Epoch ms; all-day events on UTC midnights, end exclusive. */
  start: number;
  end: number;
  /** IANA zone the event (and its rule) lives in. */
  timeZone: string;
  /** Bare RRULE ("FREQ=…;UNTIL=…Z"), or null. */
  rrule: string | null;
  /** The rule's UNTIL as an instant (null for COUNT / open-ended / no rule). */
  recurrenceEndsAt: number | null;
  /** Occurrence starts to cancel (EXDATE, and occurrences replaced by RECURRENCE-ID). */
  exdates: number[];
  status: "confirmed" | "planned";
  /** STATUS:CANCELLED in the file. */
  cancelled: boolean;
  warnings: IcsWarning[];
}

export interface IcsParseResult {
  events: IcsEvent[];
  /** VEVENTs that couldn't be read (no or unreadable DTSTART). */
  skipped: number;
}

export interface IcsParseOptions {
  /** Zone for floating times, unknown TZIDs and all-day events. */
  viewerZone: string;
}

interface Prop {
  name: string;
  params: Record<string, string>;
  value: string;
}

// --- Lexing ----------------------------------------------------------------

/** Unfolds continuation lines (a leading space or tab joins the previous line). */
function unfold(text: string): string[] {
  const out: string[] = [];
  for (const raw of text.replace(/\r\n?/g, "\n").split("\n")) {
    if ((raw.startsWith(" ") || raw.startsWith("\t")) && out.length > 0) {
      out[out.length - 1] += raw.slice(1);
    } else if (raw.length > 0) {
      out.push(raw);
    }
  }
  return out;
}

/** "NAME;P1=a;P2="b:c":value" → a Prop; null when the line has no value. */
function parseLine(line: string): Prop | null {
  let quoted = false;
  let colon = -1;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') quoted = !quoted;
    else if (c === ":" && !quoted) {
      colon = i;
      break;
    }
  }
  if (colon < 0) return null;
  const head = line.slice(0, colon);
  const value = line.slice(colon + 1);
  const parts: string[] = [];
  let current = "";
  quoted = false;
  for (const c of head) {
    if (c === '"') quoted = !quoted;
    if (c === ";" && !quoted) {
      parts.push(current);
      current = "";
    } else {
      current += c;
    }
  }
  parts.push(current);
  const params: Record<string, string> = {};
  for (const p of parts.slice(1)) {
    const eq = p.indexOf("=");
    if (eq < 0) continue;
    params[p.slice(0, eq).toUpperCase()] = p.slice(eq + 1).replace(/^"|"$/g, "");
  }
  return { name: parts[0].toUpperCase(), params, value };
}

/** TEXT unescaping: \n \N \, \; \\. */
export function unescapeText(value: string): string {
  return value.replace(/\\([nN,;\\])/g, (_, c: string) => (c === "n" || c === "N" ? "\n" : c));
}

// --- Times -------------------------------------------------------------------

interface ReadTime {
  allDay: boolean;
  ms: number;
  /** Resolved zone of a TZID'd time; "UTC" for a Z time; null for date / floating / unknown. */
  zone: string | null;
  utc: boolean;
  unknownZone: boolean;
  /** Wall-clock parts, for re-anchoring a date-only EXDATE on a timed series. */
  wall: [number, number, number, number, number, number];
}

const DATE_RE = /^(\d{4})(\d{2})(\d{2})$/;
const DATE_TIME_RE = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/;

/** One date or date-time value; null when unreadable. */
function readTime(value: string, params: Record<string, string>, viewerZone: string): ReadTime | null {
  const v = value.trim();
  const date = DATE_RE.exec(v);
  if (date || params.VALUE === "DATE") {
    const m = date ?? DATE_TIME_RE.exec(v);
    if (!m) return null;
    const [y, mo, d] = [+m[1], +m[2], +m[3]];
    return { allDay: true, ms: Date.UTC(y, mo - 1, d), zone: null, utc: false, unknownZone: false, wall: [y, mo, d, 0, 0, 0] };
  }
  const m = DATE_TIME_RE.exec(v);
  if (!m) return null;
  const wall: ReadTime["wall"] = [+m[1], +m[2], +m[3], +m[4], +m[5], +m[6]];
  if (m[7] === "Z") {
    return { allDay: false, ms: Date.UTC(wall[0], wall[1] - 1, wall[2], wall[3], wall[4], wall[5]), zone: "UTC", utc: true, unknownZone: false, wall };
  }
  const tzid = params.TZID;
  const resolved = tzid ? resolveZone(tzid) : null;
  const zone = resolved ?? viewerZone;
  return {
    allDay: false,
    ms: wallToInstant(zone, ...wall),
    zone: resolved,
    utc: false,
    unknownZone: Boolean(tzid) && resolved === null,
    wall,
  };
}

/** RFC 5545 DURATION ("P1D", "PT1H30M", "-P1W") in ms; null when unreadable. */
export function parseDuration(value: string): number | null {
  const m = /^([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(value.trim());
  if (!m || value.trim() === "P" || /T$/.test(value.trim())) return null;
  const [, sign, w, d, h, mi, s] = m;
  const ms = ((+(w ?? 0) * 7 + +(d ?? 0)) * 24 * 3600 + +(h ?? 0) * 3600 + +(mi ?? 0) * 60 + +(s ?? 0)) * 1000;
  return sign === "-" ? -ms : ms;
}

/** "YYYYMMDDTHHMMSSZ" of an instant. */
function utcStamp(ms: number): string {
  return new Date(ms).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

// --- Rules -------------------------------------------------------------------

const SUPPORTED_FREQ = new Set(["YEARLY", "MONTHLY", "WEEKLY", "DAILY"]);

/**
 * The rule as Planr stores it — bare, DTSTART/TZID parts dropped, UNTIL in
 * UTC — and its UNTIL instant; null when the rule can't be expanded.
 */
export function normalizeRRule(
  value: string,
  start: { allDay: boolean; zone: string },
): { rrule: string; until: number | null } | null {
  const raw = value.trim().replace(/^RRULE:/i, "");
  const parts: string[] = [];
  let until: number | null = null;
  let freq: string | null = null;
  for (const part of raw.split(";")) {
    if (!part) continue;
    const eq = part.indexOf("=");
    if (eq < 0) return null;
    const key = part.slice(0, eq).toUpperCase();
    let val = part.slice(eq + 1);
    if (key === "DTSTART" || key === "TZID") continue;
    if (key === "FREQ") freq = val.toUpperCase();
    if (key === "UNTIL") {
      const date = DATE_RE.exec(val);
      const dateTime = DATE_TIME_RE.exec(val);
      if (date) {
        const [y, mo, d] = [+date[1], +date[2], +date[3]];
        // An all-day rule keeps its date UNTIL; a timed rule ends with that local day.
        until = start.allDay ? Date.UTC(y, mo - 1, d) : wallToInstant(start.zone, y, mo, d, 23, 59, 59);
        if (!start.allDay) val = utcStamp(until);
      } else if (dateTime) {
        const wall = [+dateTime[1], +dateTime[2], +dateTime[3], +dateTime[4], +dateTime[5], +dateTime[6]] as const;
        until = dateTime[7] === "Z"
          ? Date.UTC(wall[0], wall[1] - 1, wall[2], wall[3], wall[4], wall[5])
          : wallToInstant(start.zone, ...wall);
        val = utcStamp(until);
      } else {
        return null;
      }
    }
    parts.push(`${key}=${val}`);
  }
  if (!freq || !SUPPORTED_FREQ.has(freq)) return null;
  const rrule = parts.join(";");
  try {
    RRule.parseString(rrule);
  } catch {
    return null;
  }
  return { rrule, until };
}

// --- Events ------------------------------------------------------------------

interface RawEvent {
  index: number;
  props: Prop[];
}

function first(props: Prop[], name: string): Prop | undefined {
  return props.find((p) => p.name === name);
}

function textOf(props: Prop[], name: string): string | null {
  const p = first(props, name);
  if (!p) return null;
  const text = unescapeText(p.value).trim();
  return text === "" ? null : text;
}

/** An occurrence's start on [series]: a date on an all-day series, the series' wall time on a date for a timed one. */
function occurrenceStart(t: ReadTime, series: { allDay: boolean; zone: string; wall: ReadTime["wall"] }): number {
  const [y, mo, d] = t.wall;
  if (series.allDay) return Date.UTC(y, mo - 1, d);
  if (t.allDay) return wallToInstant(series.zone, y, mo, d, series.wall[3], series.wall[4], series.wall[5]);
  return t.ms;
}

interface Built {
  event: IcsEvent;
  recurrenceId: ReadTime | null;
  wall: ReadTime["wall"];
}

function buildEvent(raw: RawEvent, viewerZone: string): Built | null {
  const { props } = raw;
  const dtstart = first(props, "DTSTART");
  if (!dtstart) return null;
  const start = readTime(dtstart.value, dtstart.params, viewerZone);
  if (!start) return null;
  const warnings: IcsWarning[] = [];
  if (start.unknownZone) warnings.push("zone-unknown");

  const rruleProp = first(props, "RRULE");
  const recurring = Boolean(rruleProp);
  const timeZone = start.allDay ? viewerZone : start.utc ? (recurring ? "UTC" : viewerZone) : (start.zone ?? viewerZone);

  // End: DTEND, else DURATION, else a day (all-day) or an hour (timed).
  let end: number | null = null;
  const dtend = first(props, "DTEND");
  if (dtend) {
    const e = readTime(dtend.value, dtend.params, viewerZone);
    if (e) end = start.allDay ? (e.allDay ? e.ms : Date.UTC(e.wall[0], e.wall[1] - 1, e.wall[2])) : e.ms;
  } else {
    const duration = first(props, "DURATION");
    const ms = duration ? parseDuration(duration.value) : null;
    if (ms !== null) end = start.ms + ms;
  }
  if (end === null) end = start.ms + (start.allDay ? DAY : HOUR);
  if (start.allDay && end < start.ms + DAY) end = start.ms + DAY;
  if (end < start.ms) end = start.ms;

  let rrule: string | null = null;
  let recurrenceEndsAt: number | null = null;
  if (rruleProp) {
    const normalized = normalizeRRule(rruleProp.value, { allDay: start.allDay, zone: timeZone });
    if (normalized) {
      rrule = normalized.rrule;
      recurrenceEndsAt = normalized.until;
    } else {
      warnings.push("rrule-unsupported");
    }
  }
  if (first(props, "RDATE")) warnings.push("rdate-ignored");

  const series = { allDay: start.allDay, zone: timeZone, wall: start.wall };
  const exdates: number[] = [];
  if (rrule) {
    for (const p of props.filter((q) => q.name === "EXDATE")) {
      for (const value of p.value.split(",")) {
        const t = readTime(value, p.params, viewerZone);
        if (t) exdates.push(occurrenceStart(t, series));
      }
    }
  }

  const ridProp = first(props, "RECURRENCE-ID");
  const recurrenceId = ridProp ? readTime(ridProp.value, ridProp.params, viewerZone) : null;

  const statusValue = (first(props, "STATUS")?.value ?? "").trim().toUpperCase();
  const uid = textOf(props, "UID");
  return {
    event: {
      key: uid ?? `#${raw.index}`,
      uid,
      title: textOf(props, "SUMMARY") ?? "",
      description: textOf(props, "DESCRIPTION"),
      location: textOf(props, "LOCATION"),
      allDay: start.allDay,
      start: start.ms,
      end,
      timeZone,
      rrule,
      recurrenceEndsAt,
      exdates,
      status: statusValue === "TENTATIVE" ? "planned" : "confirmed",
      cancelled: statusValue === "CANCELLED",
      warnings,
    },
    recurrenceId,
    wall: start.wall,
  };
}

/**
 * Every VEVENT of [text] as an import draft, sorted by start (then title,
 * then key). Replaced occurrences (RECURRENCE-ID) of a series in the same
 * file are cancelled on the series and kept as their own one-off events.
 */
export function parseIcs(text: string, options: IcsParseOptions): IcsParseResult {
  const raws: RawEvent[] = [];
  const stack: string[] = [];
  let current: Prop[] | null = null;
  let skipped = 0;
  for (const line of unfold(text)) {
    const prop = parseLine(line);
    if (!prop) continue;
    if (prop.name === "BEGIN") {
      const component = prop.value.trim().toUpperCase();
      stack.push(component);
      if (component === "VEVENT") current = [];
      continue;
    }
    if (prop.name === "END") {
      const component = prop.value.trim().toUpperCase();
      if (component === "VEVENT" && current) {
        raws.push({ index: raws.length, props: current });
        current = null;
      }
      const at = stack.lastIndexOf(component);
      if (at >= 0) stack.length = at;
      continue;
    }
    // Properties of the event itself, not of a nested VALARM.
    if (current && stack[stack.length - 1] === "VEVENT") current.push(prop);
  }

  const built: Built[] = [];
  for (const raw of raws) {
    const b = buildEvent(raw, options.viewerZone);
    if (b) built.push(b);
    else skipped += 1;
  }

  const masters = new Map<string, Built>();
  for (const b of built) {
    if (!b.recurrenceId && b.event.uid && b.event.rrule && !masters.has(b.event.uid)) masters.set(b.event.uid, b);
  }

  const events: IcsEvent[] = [];
  const keys = new Set<string>();
  for (const b of built) {
    const event = { ...b.event };
    if (b.recurrenceId && event.uid) {
      const master = masters.get(event.uid);
      const replaced = master
        ? occurrenceStart(b.recurrenceId, { allDay: master.event.allDay, zone: master.event.timeZone, wall: master.wall })
        : b.recurrenceId.ms;
      if (master) master.event.exdates.push(replaced);
      const stamp = b.recurrenceId.allDay && (!master || master.event.allDay)
        ? utcStamp(replaced).slice(0, 8)
        : utcStamp(replaced);
      event.uid = `${event.uid}#${stamp}`;
      event.key = event.uid;
      event.rrule = null;
      event.recurrenceEndsAt = null;
      event.exdates = [];
    }
    let key = event.key;
    for (let n = 2; keys.has(key); n++) key = `${event.key}~${n}`;
    keys.add(key);
    events.push({ ...event, key });
  }
  // A series' copy shares its exdates array, so replacements found after it are in.
  for (const e of events) e.exdates = [...new Set(e.exdates)].sort((a, b) => a - b);
  events.sort((a, b) => a.start - b.start || compareStrings(a.title, b.title) || compareStrings(a.key, b.key));
  return { events, skipped };
}

/** Code-unit order: identical in JS and on the JVM, unlike locale collation. */
function compareStrings(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
