// Time-zone plumbing for .ics import, kept free of the process zone so the
// Android port (java.time) resolves every wall time identically.

const DAY = 86_400_000;

const offsetFormats = new Map<string, Intl.DateTimeFormat>();

function formatFor(zone: string): Intl.DateTimeFormat {
  let fmt = offsetFormats.get(zone);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat("en-US", {
      timeZone: zone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    offsetFormats.set(zone, fmt);
  }
  return fmt;
}

/** The zone's UTC offset (ms) at instant `ms`. */
function offsetAt(ms: number, zone: string): number {
  const f: Record<string, number> = {};
  for (const p of formatFor(zone).formatToParts(ms)) if (p.type !== "literal") f[p.type] = Number(p.value);
  const asUtc = Date.UTC(f.year, f.month - 1, f.day, f.hour, f.minute, f.second);
  const whole = ms - (((ms % 1000) + 1000) % 1000);
  return asUtc - whole;
}

/** True when `zone` is an IANA zone this runtime knows. */
export function isKnownZone(zone: string): boolean {
  if (!zone || zone.trim() !== zone) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

/**
 * Epoch ms of a wall time in `zone`, resolved like java.time's
 * `ZonedDateTime.ofLocal`: a repeated time takes the EARLIER instant, a time
 * inside a gap moves forward by the gap's length.
 */
export function wallToInstant(
  zone: string,
  y: number,
  mo: number,
  d: number,
  h = 0,
  mi = 0,
  s = 0,
): number {
  const asUtc = Date.UTC(y, mo - 1, d, h, mi, s);
  const before = offsetAt(asUtc - DAY, zone);
  const after = offsetAt(asUtc + DAY, zone);
  const valid = [asUtc - before, asUtc - after].filter((c) => offsetAt(c, zone) === asUtc - c);
  if (valid.length > 0) return Math.min(...valid);
  return asUtc - before;
}

/**
 * Windows time-zone names (Outlook / Exchange exports put these in TZID) to
 * IANA, from CLDR's windowsZones "001" territory. Only the zones a European or
 * American household is likely to meet; anything else falls back to the
 * viewer's zone with a warning.
 */
export const WINDOWS_ZONES: Readonly<Record<string, string>> = {
  "UTC": "UTC",
  "GMT Standard Time": "Europe/London",
  "Greenwich Standard Time": "Atlantic/Reykjavik",
  "W. Europe Standard Time": "Europe/Berlin",
  "Central Europe Standard Time": "Europe/Budapest",
  "Central European Standard Time": "Europe/Warsaw",
  "Romance Standard Time": "Europe/Paris",
  "E. Europe Standard Time": "Europe/Chisinau",
  "FLE Standard Time": "Europe/Kiev",
  "GTB Standard Time": "Europe/Bucharest",
  "Kaliningrad Standard Time": "Europe/Kaliningrad",
  "Russian Standard Time": "Europe/Moscow",
  "Belarus Standard Time": "Europe/Minsk",
  "Turkey Standard Time": "Europe/Istanbul",
  "Israel Standard Time": "Asia/Jerusalem",
  "Arabian Standard Time": "Asia/Dubai",
  "Caucasus Standard Time": "Asia/Yerevan",
  "Georgian Standard Time": "Asia/Tbilisi",
  "Ekaterinburg Standard Time": "Asia/Yekaterinburg",
  "N. Central Asia Standard Time": "Asia/Novosibirsk",
  "North Asia Standard Time": "Asia/Krasnoyarsk",
  "North Asia East Standard Time": "Asia/Irkutsk",
  "Yakutsk Standard Time": "Asia/Yakutsk",
  "Vladivostok Standard Time": "Asia/Vladivostok",
  "India Standard Time": "Asia/Calcutta",
  "China Standard Time": "Asia/Shanghai",
  "Tokyo Standard Time": "Asia/Tokyo",
  "AUS Eastern Standard Time": "Australia/Sydney",
  "Eastern Standard Time": "America/New_York",
  "Central Standard Time": "America/Chicago",
  "Mountain Standard Time": "America/Denver",
  "US Mountain Standard Time": "America/Phoenix",
  "Pacific Standard Time": "America/Los_Angeles",
  "Alaskan Standard Time": "America/Anchorage",
  "Hawaiian Standard Time": "Pacific/Honolulu",
  "Atlantic Standard Time": "America/Halifax",
  "SA Pacific Standard Time": "America/Bogota",
  "E. South America Standard Time": "America/Sao_Paulo",
  "Argentina Standard Time": "America/Buenos_Aires",
};

/**
 * The IANA zone a TZID names: itself when known, its Windows mapping, or a
 * `/`-suffixed tail some exporters prepend paths to ("/mozilla.org/…/Europe/Berlin").
 * Null when nothing resolves.
 */
export function resolveZone(tzid: string): string | null {
  const id = tzid.trim().replace(/^"|"$/g, "");
  if (isKnownZone(id)) return id;
  const windows = WINDOWS_ZONES[id];
  if (windows) return windows;
  const parts = id.split("/").filter(Boolean);
  for (let i = 0; i < parts.length - 1; i++) {
    const tail = parts.slice(i).join("/");
    if (tail.includes("/") && isKnownZone(tail)) return tail;
  }
  return null;
}
