import "server-only";
import { randomBytes, createHash } from "node:crypto";
import { allDayDateKey } from "@/lib/datetime/local";

/**
 * Google Health API (https://health.googleapis.com/v4) + Google OAuth 2.0
 * client for the Fitbit Air sync. Facts below are as verified from
 * developers.google.com/health (Sept 2026) — anything past the documented
 * field names is NOT guaranteed by Google's docs, so the point-parsing
 * functions at the bottom are deliberately tolerant (optional chaining,
 * several candidate field spellings) and say so inline.
 */

export const HEALTH_API_BASE = "https://health.googleapis.com/v4";
export const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
export const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
export const GOOGLE_REVOKE_URL = "https://oauth2.googleapis.com/revoke";

/** The three read scopes covering everything the plan wants ("everything useful"). */
export const HEALTH_SCOPES = [
  "https://www.googleapis.com/auth/googlehealth.sleep.readonly",
  "https://www.googleapis.com/auth/googlehealth.health_metrics_and_measurements.readonly",
  "https://www.googleapis.com/auth/googlehealth.activity_and_fitness.readonly",
];

const DATA_TYPES = {
  sleep: "sleep",
  hrv: "daily-heart-rate-variability",
  restingHr: "daily-resting-heart-rate",
  spo2: "daily-oxygen-saturation",
  steps: "steps",
  activeZoneMinutes: "active-zone-minutes",
  exercise: "exercise",
} as const;

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) {
    throw new Error(
      `${name} is not set. See docs/health-sync.md for the GCP OAuth client setup.`,
    );
  }
  return v;
}

export function getGoogleHealthClientId(): string {
  return requireEnv("GOOGLE_HEALTH_CLIENT_ID");
}

function getGoogleHealthClientSecret(): string {
  return requireEnv("GOOGLE_HEALTH_CLIENT_SECRET");
}

// --- PKCE --------------------------------------------------------------

export interface Pkce {
  verifier: string;
  challenge: string;
}

/** RFC 7636 S256 PKCE pair for the auth-code exchange. */
export function generatePkce(): Pkce {
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

/**
 * The Google consent URL. `access_type=offline&prompt=consent` (no
 * `include_granted_scopes`) so a refresh token is always issued, even on a
 * re-connect after a prior grant — per the plan's OAuth notes.
 */
export function buildAuthUrl(opts: {
  redirectUri: string;
  state: string;
  codeChallenge: string;
}): string {
  const url = new URL(GOOGLE_AUTH_URL);
  url.searchParams.set("client_id", getGoogleHealthClientId());
  url.searchParams.set("redirect_uri", opts.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", HEALTH_SCOPES.join(" "));
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("state", opts.state);
  url.searchParams.set("code_challenge", opts.codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  return url.toString();
}

export interface GoogleTokens {
  accessToken: string;
  /** Only present when Google issues/rotates one (first grant, or occasionally on refresh). */
  refreshToken?: string;
  expiresIn: number;
  scope?: string;
}

/** Thrown by the token endpoints; `code` is Google's `error` field (e.g. "invalid_grant"). */
export class GoogleOAuthError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "GoogleOAuthError";
    this.code = code;
  }
}

async function postForm(
  url: string,
  body: Record<string, string>,
  fetchImpl: typeof fetch,
): Promise<Record<string, unknown>> {
  const res = await fetchImpl(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body).toString(),
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const code = typeof json.error === "string" ? json.error : `http_${res.status}`;
    const description =
      typeof json.error_description === "string" ? json.error_description : res.statusText;
    throw new GoogleOAuthError(code, `Google OAuth error (${code}): ${description}`);
  }
  return json;
}

function toTokens(json: Record<string, unknown>): GoogleTokens {
  return {
    accessToken: json.access_token as string,
    refreshToken: typeof json.refresh_token === "string" ? json.refresh_token : undefined,
    expiresIn: Number(json.expires_in ?? 3600),
    scope: typeof json.scope === "string" ? json.scope : undefined,
  };
}

export async function exchangeCode(
  code: string,
  codeVerifier: string,
  redirectUri: string,
  fetchImpl: typeof fetch = fetch,
): Promise<GoogleTokens> {
  const json = await postForm(
    GOOGLE_TOKEN_URL,
    {
      client_id: getGoogleHealthClientId(),
      client_secret: getGoogleHealthClientSecret(),
      code,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
      code_verifier: codeVerifier,
    },
    fetchImpl,
  );
  return toTokens(json);
}

export async function refreshAccessToken(
  refreshToken: string,
  fetchImpl: typeof fetch = fetch,
): Promise<GoogleTokens> {
  const json = await postForm(
    GOOGLE_TOKEN_URL,
    {
      client_id: getGoogleHealthClientId(),
      client_secret: getGoogleHealthClientSecret(),
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    },
    fetchImpl,
  );
  return toTokens(json);
}

/** Revoke a token (access or refresh) at Google. Best-effort — never throws. */
export async function revokeToken(
  token: string,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  try {
    await fetchImpl(`${GOOGLE_REVOKE_URL}?token=${encodeURIComponent(token)}`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });
  } catch {
    // Disconnect must still succeed locally even if Google is unreachable.
  }
}

/** healthUserId via GET /v4/users/me/identity. */
export async function fetchHealthUserId(
  accessToken: string,
  fetchImpl: typeof fetch = fetch,
): Promise<string | null> {
  const res = await fetchImpl(`${HEALTH_API_BASE}/users/me/identity`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return null;
  const json = (await res.json().catch(() => ({}))) as { healthUserId?: string };
  return json.healthUserId ?? null;
}

// --- data points ---------------------------------------------------------

interface RawPoint {
  [key: string]: unknown;
}

interface ListResponse {
  dataPoints?: RawPoint[];
  nextPageToken?: string;
}

/** GET .../dataPoints, following `pageToken` until exhausted. */
async function listAllDataPoints(
  accessToken: string,
  type: string,
  filter: string,
  fetchImpl: typeof fetch,
): Promise<RawPoint[]> {
  const points: RawPoint[] = [];
  let pageToken: string | undefined;
  do {
    const url = new URL(`${HEALTH_API_BASE}/users/me/dataTypes/${type}/dataPoints`);
    url.searchParams.set("filter", filter);
    url.searchParams.set("pageSize", "200");
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const res = await fetchImpl(url.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (res.status === 404) return points; // type never reported for this user
    if (!res.ok) {
      throw new Error(`Google Health API error listing ${type}: HTTP ${res.status}`);
    }
    const json = (await res.json()) as ListResponse;
    points.push(...(json.dataPoints ?? []));
    pageToken = json.nextPageToken;
  } while (pageToken);
  return points;
}

/** POST .../dataPoints:dailyRollUp for the civil-date range [startDate, endDate]. */
async function dailyRollUp(
  accessToken: string,
  type: string,
  startDate: string,
  endDate: string,
  fetchImpl: typeof fetch,
): Promise<RawPoint[]> {
  const url = `${HEALTH_API_BASE}/users/me/dataTypes/${type}/dataPoints:dailyRollUp`;
  const res = await fetchImpl(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      civilDateRange: { startDate, endDate },
    }),
  });
  if (res.status === 404) return [];
  if (!res.ok) {
    throw new Error(`Google Health API error rolling up ${type}: HTTP ${res.status}`);
  }
  const json = (await res.json().catch(() => ({}))) as { dataPoints?: RawPoint[] };
  return json.dataPoints ?? [];
}

// --- pure parsing (unit-tested against fixtures) --------------------------

/**
 * Read a numeric value by trying several plausible nested-field spellings in
 * order (Google's exact undocumented shape isn't guaranteed) — the first
 * candidate that resolves to a finite number wins. Every candidate is an
 * array of keys walked with optional chaining, so a missing intermediate key
 * just falls through to the next candidate.
 */
function firstNumber(point: RawPoint, candidates: string[][]): number | null {
  for (const path of candidates) {
    let cur: unknown = point;
    for (const key of path) {
      if (cur == null || typeof cur !== "object") {
        cur = undefined;
        break;
      }
      cur = (cur as RawPoint)[key];
    }
    if (typeof cur === "number" && Number.isFinite(cur)) return cur;
  }
  return null;
}

function firstString(point: RawPoint, candidates: string[][]): string | null {
  for (const path of candidates) {
    let cur: unknown = point;
    for (const key of path) {
      if (cur == null || typeof cur !== "object") {
        cur = undefined;
        break;
      }
      cur = (cur as RawPoint)[key];
    }
    if (typeof cur === "string" && cur) return cur;
  }
  return null;
}

const MINUTE_MS = 60_000;

/**
 * The zone-free wake date of a sleep point: `endTime` shifted by
 * `endUtcOffset` (minutes) and read as a UTC calendar date — the same
 * convention `sleep_logs.date` already uses (see lib/datetime/local.ts's
 * `allDayDateKey`), so an auto-filled night lands on the same date a manual
 * check-in for the same night would.
 */
export function wakeDateOfSleepPoint(point: {
  endTime: string;
  endUtcOffset?: number | null;
}): string {
  const endMs = Date.parse(point.endTime);
  const offsetMin = point.endUtcOffset ?? 0;
  return allDayDateKey(endMs + offsetMin * MINUTE_MS);
}

export interface ParsedSleepStages {
  minutesDeep: number | null;
  minutesLight: number | null;
  minutesRem: number | null;
  minutesAwake: number | null;
}

/** Sum each stage type's duration (ms) from `stages[]`, in minutes. */
export function sumSleepStages(
  stages: { startTime: string; endTime: string; type: string }[] | undefined,
): ParsedSleepStages {
  const totals: Record<string, number> = { LIGHT: 0, DEEP: 0, REM: 0, AWAKE: 0 };
  let matched = false;
  for (const s of stages ?? []) {
    const type = (s.type ?? "").toUpperCase();
    if (!(type in totals)) continue;
    matched = true;
    const ms = Date.parse(s.endTime) - Date.parse(s.startTime);
    if (ms > 0) totals[type] += ms;
  }
  const toMin = (ms: number) => Math.round(ms / MINUTE_MS);
  return {
    minutesDeep: matched ? toMin(totals.DEEP) : null,
    minutesLight: matched ? toMin(totals.LIGHT) : null,
    minutesRem: matched ? toMin(totals.REM) : null,
    minutesAwake: matched ? toMin(totals.AWAKE) : null,
  };
}

export interface ParsedSleepPoint {
  date: string; // wake date
  start: string; // ISO
  end: string; // ISO
  minutesAsleep: number | null;
  deep: number | null;
  light: number | null;
  rem: number | null;
  awake: number | null;
  efficiency: number | null;
}

/**
 * Parse one raw `sleep` data point. `summary.minutesAsleep`/`minutesAwake`
 * are the documented fields; stage minutes come from `stages[]` when
 * present, else fall back to null (never fabricated from the summary).
 */
export function parseSleepPoint(point: RawPoint): ParsedSleepPoint | null {
  const startTime = point.startTime as string | undefined;
  const endTime = point.endTime as string | undefined;
  if (!startTime || !endTime) return null;
  const date = wakeDateOfSleepPoint({
    endTime,
    endUtcOffset: (point.endUtcOffset as number | null | undefined) ?? null,
  });
  const stages = sumSleepStages(
    point.stages as { startTime: string; endTime: string; type: string }[] | undefined,
  );
  const minutesAsleep = firstNumber(point, [["summary", "minutesAsleep"]]);
  const minutesAwakeSummary = firstNumber(point, [["summary", "minutesAwake"]]);
  const efficiency =
    minutesAsleep != null && (minutesAwakeSummary ?? stages.minutesAwake) != null
      ? Math.round(
          (minutesAsleep /
            (minutesAsleep + (minutesAwakeSummary ?? stages.minutesAwake ?? 0))) *
            1000,
        ) / 10
      : null;
  return {
    date,
    start: startTime,
    end: endTime,
    minutesAsleep,
    deep: stages.minutesDeep,
    light: stages.minutesLight,
    rem: stages.minutesRem,
    awake: minutesAwakeSummary ?? stages.minutesAwake,
    efficiency,
  };
}

/** Pick the "main" sleep for a date — the longest of any points sharing that wake date. */
export function pickMainSleepPerDate(
  points: ParsedSleepPoint[],
): Map<string, ParsedSleepPoint> {
  const byDate = new Map<string, ParsedSleepPoint>();
  for (const p of points) {
    const existing = byDate.get(p.date);
    if (!existing) {
      byDate.set(p.date, p);
      continue;
    }
    const dur = (a: ParsedSleepPoint) => Date.parse(a.end) - Date.parse(a.start);
    if (dur(p) > dur(existing)) byDate.set(p.date, p);
  }
  return byDate;
}

/**
 * A single daily numeric metric (HRV / resting HR / SpO2). Field names are
 * undocumented beyond the type id, so several plausible spellings are tried:
 * a plain top-level `value`, a `{fpVal}`/`{intVal}` value wrapper (the shape
 * Google Fit used), and a type-named summary object.
 */
function parseDailyMetricPoint(
  point: RawPoint,
  /** Extra full paths to try, beyond the generic `value`/`value.fpVal`/`value.intVal` ones. */
  extraCandidates: string[][],
): { date: string | null; value: number | null } {
  const civilDate = (firstString(point, [["interval", "civilStartTime"]]) ?? "").slice(0, 10);
  const startDate = (firstString(point, [["startTime"]]) ?? "").slice(0, 10);
  const date = firstString(point, [["date"]]) ?? (civilDate || startDate || null);
  const candidates: string[][] = [
    ["value"],
    ["value", "fpVal"],
    ["value", "intVal"],
    ...extraCandidates,
    // The same field name(s) again, but also tried as a bare `.value`/`.avg`
    // wrapper under each candidate's summary object — covers a plausible
    // "{ summaryKey: { value: N } }" shape without hardcoding it per metric.
    ...extraCandidates.map((path) => [...path.slice(0, -1), "value"]),
    ...extraCandidates.map((path) => [...path.slice(0, -1), "avg"]),
  ];
  return { date, value: firstNumber(point, candidates) };
}

export function parseHrvPoint(point: RawPoint) {
  return parseDailyMetricPoint(point, [
    ["heartRateVariabilitySummary", "rmssdMillis"],
    ["dailyHeartRateVariabilitySummary", "rmssdMillis"],
  ]);
}
export function parseRestingHrPoint(point: RawPoint) {
  return parseDailyMetricPoint(point, [["restingHeartRateSummary", "bpm"]]);
}
export function parseSpo2Point(point: RawPoint) {
  return parseDailyMetricPoint(point, [["oxygenSaturationSummary", "percentage"]]);
}
export function parseStepsRollup(point: RawPoint) {
  return parseDailyMetricPoint(point, [["stepsSummary", "count"]]);
}
export function parseActiveZoneMinutesRollup(point: RawPoint) {
  return parseDailyMetricPoint(point, [["activeZoneMinutesSummary", "minutes"]]);
}

/** Exercise minutes for a date: sum of session durations reported that civil date. */
export function parseExercisePoints(points: RawPoint[]): Map<string, number> {
  const byDate = new Map<string, number>();
  for (const p of points) {
    const start = p.startTime as string | undefined;
    const end = p.endTime as string | undefined;
    if (!start || !end) continue;
    const offset = (p.startUtcOffset as number | null | undefined) ?? 0;
    const date = allDayDateKey(Date.parse(start) + offset * MINUTE_MS);
    const minutes = Math.max(0, Math.round((Date.parse(end) - Date.parse(start)) / MINUTE_MS));
    byDate.set(date, (byDate.get(date) ?? 0) + minutes);
  }
  return byDate;
}

// --- fetchDay --------------------------------------------------------------

export interface HealthDayData {
  date: string;
  sleepStart: string | null;
  sleepEnd: string | null;
  minutesAsleep: number | null;
  minutesDeep: number | null;
  minutesLight: number | null;
  minutesRem: number | null;
  minutesAwake: number | null;
  efficiency: number | null;
  hrvMs: number | null;
  restingHr: number | null;
  spo2Avg: number | null;
  steps: number | null;
  activeZoneMinutes: number | null;
  exerciseMinutes: number | null;
}

function isoFilter(field: string, startDate: string, endDate: string): string {
  return (
    `${field} >= "${startDate}T00:00:00Z" AND ` + `${field} <= "${endDate}T23:59:59.999Z"`
  );
}

/**
 * Fetch and merge every metric for the civil-date range [startDate, endDate]
 * (inclusive), producing one entry per date that reported anything. Sleep and
 * the daily-* aggregate types are read via `:list`; steps and active zone
 * minutes via `:dailyRollUp` (per the plan — those two aren't naturally daily
 * points, everything else already is). A 401 is surfaced as-is; the caller
 * (lib/health/sync.ts) owns the one-retry-after-refresh policy.
 */
export async function fetchDay(
  accessToken: string,
  range: { startDate: string; endDate: string },
  fetchImpl: typeof fetch = fetch,
): Promise<HealthDayData[]> {
  const { startDate, endDate } = range;
  const byDate = new Map<string, HealthDayData>();
  const get = (date: string): HealthDayData => {
    let d = byDate.get(date);
    if (!d) {
      d = {
        date,
        sleepStart: null,
        sleepEnd: null,
        minutesAsleep: null,
        minutesDeep: null,
        minutesLight: null,
        minutesRem: null,
        minutesAwake: null,
        efficiency: null,
        hrvMs: null,
        restingHr: null,
        spo2Avg: null,
        steps: null,
        activeZoneMinutes: null,
        exerciseMinutes: null,
      };
      byDate.set(date, d);
    }
    return d;
  };

  const [sleepRaw, hrvRaw, rhrRaw, spo2Raw, exerciseRaw, stepsRaw, azmRaw] =
    await Promise.all([
      listAllDataPoints(
        accessToken,
        DATA_TYPES.sleep,
        isoFilter("sleep.interval.start_time", startDate, endDate),
        fetchImpl,
      ),
      listAllDataPoints(
        accessToken,
        DATA_TYPES.hrv,
        isoFilter("daily-heart-rate-variability.interval.civil_start_time", startDate, endDate),
        fetchImpl,
      ),
      listAllDataPoints(
        accessToken,
        DATA_TYPES.restingHr,
        isoFilter("daily-resting-heart-rate.interval.civil_start_time", startDate, endDate),
        fetchImpl,
      ),
      listAllDataPoints(
        accessToken,
        DATA_TYPES.spo2,
        isoFilter("daily-oxygen-saturation.interval.civil_start_time", startDate, endDate),
        fetchImpl,
      ),
      listAllDataPoints(
        accessToken,
        DATA_TYPES.exercise,
        isoFilter("exercise.interval.start_time", startDate, endDate),
        fetchImpl,
      ),
      dailyRollUp(accessToken, DATA_TYPES.steps, startDate, endDate, fetchImpl),
      dailyRollUp(accessToken, DATA_TYPES.activeZoneMinutes, startDate, endDate, fetchImpl),
    ]);

  const sleepPoints = sleepRaw
    .map(parseSleepPoint)
    .filter((p): p is ParsedSleepPoint => p !== null);
  for (const [date, main] of pickMainSleepPerDate(sleepPoints)) {
    if (date < startDate || date > endDate) continue;
    const d = get(date);
    d.sleepStart = main.start;
    d.sleepEnd = main.end;
    d.minutesAsleep = main.minutesAsleep;
    d.minutesDeep = main.deep;
    d.minutesLight = main.light;
    d.minutesRem = main.rem;
    d.minutesAwake = main.awake;
    d.efficiency = main.efficiency;
  }

  for (const raw of hrvRaw) {
    const { date, value } = parseHrvPoint(raw);
    if (date) get(date).hrvMs = value;
  }
  for (const raw of rhrRaw) {
    const { date, value } = parseRestingHrPoint(raw);
    if (date) get(date).restingHr = value;
  }
  for (const raw of spo2Raw) {
    const { date, value } = parseSpo2Point(raw);
    if (date) get(date).spo2Avg = value;
  }
  for (const raw of stepsRaw) {
    const { date, value } = parseStepsRollup(raw);
    if (date) get(date).steps = value;
  }
  for (const raw of azmRaw) {
    const { date, value } = parseActiveZoneMinutesRollup(raw);
    if (date) get(date).activeZoneMinutes = value;
  }
  for (const [date, minutes] of parseExercisePoints(exerciseRaw)) {
    if (date < startDate || date > endDate) continue;
    get(date).exerciseMinutes = minutes;
  }

  return Array.from(byDate.values()).sort((a, b) => (a.date < b.date ? -1 : 1));
}
