import { describe, it, expect, vi } from "vitest";
import {
  wakeDateOfSleepPoint,
  sumSleepStages,
  parseSleepPoint,
  pickMainSleepPerDate,
  parseHrvPoint,
  parseRestingHrPoint,
  parseSpo2Point,
  parseStepsRollup,
  parseActiveZoneMinutesRollup,
  parseExercisePoints,
  fetchDay,
  type ParsedSleepPoint,
} from "@/lib/health/google";

describe("wakeDateOfSleepPoint", () => {
  it("reads the zone-free date from endTime shifted by endUtcOffset", () => {
    // 08:30Z with a +120 offset is 10:30 local — still the same UTC date.
    expect(
      wakeDateOfSleepPoint({ endTime: "2026-06-02T08:30:00Z", endUtcOffset: 120 }),
    ).toBe("2026-06-02");
  });

  it("crosses a day boundary the offset implies, not the raw UTC date", () => {
    // 04:50Z with a -300 (EST) offset is 23:50 the PREVIOUS local day — a
    // naive `endTime.slice(0, 10)` would wrongly read 03-14. This is the
    // scenario worth checking near a DST transition: Google gives us a
    // literal offset (not an IANA zone), so nothing here depends on the
    // host's DST rules at all — that's exactly why it stays correct across
    // the US spring-forward night (2027-03-14 in America/New_York).
    expect(
      wakeDateOfSleepPoint({ endTime: "2027-03-14T04:50:00Z", endUtcOffset: -300 }),
    ).toBe("2027-03-13");
  });

  it("defaults to UTC (offset 0) when endUtcOffset is missing", () => {
    expect(wakeDateOfSleepPoint({ endTime: "2026-06-02T23:50:00Z" })).toBe("2026-06-02");
  });
});

describe("sumSleepStages", () => {
  it("sums each stage type's minutes, case-insensitively", () => {
    const stages = [
      { startTime: "2026-06-02T02:00:00Z", endTime: "2026-06-02T02:30:00Z", type: "LIGHT" },
      { startTime: "2026-06-02T02:30:00Z", endTime: "2026-06-02T03:30:00Z", type: "deep" },
      { startTime: "2026-06-02T03:30:00Z", endTime: "2026-06-02T03:45:00Z", type: "REM" },
      { startTime: "2026-06-02T03:45:00Z", endTime: "2026-06-02T03:50:00Z", type: "Awake" },
    ];
    expect(sumSleepStages(stages)).toEqual({
      minutesDeep: 60,
      minutesLight: 30,
      minutesRem: 15,
      minutesAwake: 5,
    });
  });

  it("returns all-null when there are no stages (not zeros)", () => {
    expect(sumSleepStages(undefined)).toEqual({
      minutesDeep: null,
      minutesLight: null,
      minutesRem: null,
      minutesAwake: null,
    });
  });

  it("ignores an unrecognized stage type", () => {
    const stages = [
      { startTime: "2026-06-02T02:00:00Z", endTime: "2026-06-02T02:30:00Z", type: "UNKNOWN" },
    ];
    expect(sumSleepStages(stages)).toEqual({
      minutesDeep: null,
      minutesLight: null,
      minutesRem: null,
      minutesAwake: null,
    });
  });
});

describe("parseSleepPoint", () => {
  it("parses a full point with stages + summary into minutes and efficiency", () => {
    const point = {
      startTime: "2026-06-01T22:00:00Z",
      endTime: "2026-06-02T06:00:00Z",
      endUtcOffset: 0,
      summary: { minutesAsleep: 450, minutesAwake: 30 },
      stages: [
        { startTime: "2026-06-01T22:00:00Z", endTime: "2026-06-02T05:30:00Z", type: "LIGHT" },
        { startTime: "2026-06-02T05:30:00Z", endTime: "2026-06-02T06:00:00Z", type: "AWAKE" },
      ],
    };
    const parsed = parseSleepPoint(point);
    expect(parsed?.date).toBe("2026-06-02");
    expect(parsed?.minutesAsleep).toBe(450);
    expect(parsed?.awake).toBe(30); // summary wins over the stage-derived 30 (same value here)
    expect(parsed?.light).toBe(450);
    expect(parsed?.efficiency).toBeCloseTo(93.8, 1); // 450 / (450+30)
  });

  it("returns null when start/end are missing", () => {
    expect(parseSleepPoint({})).toBeNull();
  });
});

describe("pickMainSleepPerDate", () => {
  it("keeps the longer of two sleep points sharing a wake date", () => {
    const short: ParsedSleepPoint = {
      date: "2026-06-02",
      start: "2026-06-02T03:00:00Z",
      end: "2026-06-02T03:30:00Z", // 30 min nap
      minutesAsleep: 25,
      deep: null,
      light: null,
      rem: null,
      awake: null,
      efficiency: null,
    };
    const main: ParsedSleepPoint = {
      ...short,
      start: "2026-06-01T22:00:00Z",
      end: "2026-06-02T06:00:00Z", // 8h main sleep
      minutesAsleep: 460,
    };
    const byDate = pickMainSleepPerDate([short, main]);
    expect(byDate.get("2026-06-02")?.minutesAsleep).toBe(460);
  });
});

describe("daily metric point parsers", () => {
  it("parseHrvPoint reads a plain top-level value + date", () => {
    expect(parseHrvPoint({ date: "2026-06-02", value: 55.4 })).toEqual({
      date: "2026-06-02",
      value: 55.4,
    });
  });

  it("parseRestingHrPoint falls back to a summary-object candidate", () => {
    expect(
      parseRestingHrPoint({
        date: "2026-06-02",
        restingHeartRateSummary: { bpm: 58 },
      }),
    ).toEqual({ date: "2026-06-02", value: 58 });
  });

  it("parseSpo2Point falls back to civil_start_time-derived date", () => {
    expect(
      parseSpo2Point({
        interval: { civilStartTime: "2026-06-02T00:00:00" },
        value: { fpVal: 97.2 },
      }),
    ).toEqual({ date: "2026-06-02", value: 97.2 });
  });

  it("parseStepsRollup and parseActiveZoneMinutesRollup read rollup shapes", () => {
    expect(
      parseStepsRollup({ date: "2026-06-02", stepsSummary: { count: 8123 } }),
    ).toEqual({ date: "2026-06-02", value: 8123 });
    expect(
      parseActiveZoneMinutesRollup({
        date: "2026-06-02",
        activeZoneMinutesSummary: { minutes: 34 },
      }),
    ).toEqual({ date: "2026-06-02", value: 34 });
  });

  it("returns a null value when nothing recognizable is present", () => {
    expect(parseHrvPoint({ date: "2026-06-02" })).toEqual({ date: "2026-06-02", value: null });
  });
});

describe("parseExercisePoints", () => {
  it("sums session minutes per wake date, offset-adjusted", () => {
    const byDate = parseExercisePoints([
      { startTime: "2026-06-02T17:00:00Z", endTime: "2026-06-02T17:45:00Z", startUtcOffset: 0 },
      { startTime: "2026-06-02T19:00:00Z", endTime: "2026-06-02T19:15:00Z", startUtcOffset: 0 },
    ]);
    expect(byDate.get("2026-06-02")).toBe(60);
  });

  it("skips points missing start/end", () => {
    expect(parseExercisePoints([{ startTime: "2026-06-02T17:00:00Z" }]).size).toBe(0);
  });
});

describe("fetchDay", () => {
  function jsonResponse(body: unknown, status = 200) {
    return {
      ok: status < 400,
      status,
      json: async () => body,
    } as Response;
  }

  it("merges sleep, daily metrics and roll-ups into one entry per date", async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/dataTypes/sleep/")) {
        return jsonResponse({
          dataPoints: [
            {
              startTime: "2026-06-01T22:00:00Z",
              endTime: "2026-06-02T06:00:00Z",
              endUtcOffset: 0,
              summary: { minutesAsleep: 460, minutesAwake: 20 },
              stages: [
                {
                  startTime: "2026-06-01T22:00:00Z",
                  endTime: "2026-06-02T05:40:00Z",
                  type: "LIGHT",
                },
              ],
            },
          ],
        });
      }
      if (url.includes("daily-heart-rate-variability")) {
        return jsonResponse({ dataPoints: [{ date: "2026-06-02", value: 52 }] });
      }
      if (url.includes("daily-resting-heart-rate")) {
        return jsonResponse({ dataPoints: [{ date: "2026-06-02", value: 57 }] });
      }
      if (url.includes("daily-oxygen-saturation")) {
        return jsonResponse({ dataPoints: [{ date: "2026-06-02", value: 96.5 }] });
      }
      if (url.includes("dataTypes/exercise/")) {
        return jsonResponse({ dataPoints: [] });
      }
      if (url.includes(":dailyRollUp")) {
        if (url.includes("/steps/")) {
          return jsonResponse({ dataPoints: [{ date: "2026-06-02", value: 9001 }] });
        }
        if (url.includes("active-zone-minutes")) {
          return jsonResponse({ dataPoints: [{ date: "2026-06-02", value: 41 }] });
        }
      }
      return jsonResponse({ dataPoints: [] });
    });

    const days = await fetchDay(
      "access-token",
      { startDate: "2026-06-01", endDate: "2026-06-02" },
      fetchImpl as unknown as typeof fetch,
    );

    const day = days.find((d) => d.date === "2026-06-02");
    expect(day).toMatchObject({
      minutesAsleep: 460,
      hrvMs: 52,
      restingHr: 57,
      spo2Avg: 96.5,
      steps: 9001,
      activeZoneMinutes: 41,
    });
  });

  it("treats a 404 for a data type as simply no data for that type", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({}, 404));
    const days = await fetchDay(
      "access-token",
      { startDate: "2026-06-02", endDate: "2026-06-02" },
      fetchImpl as unknown as typeof fetch,
    );
    expect(days).toEqual([]);
  });
});
