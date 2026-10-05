import { describe, expect, it } from "vitest";

import { isRatedLog, keepDeviceTimes } from "@/lib/sleep/device-times";
import type { SleepLog } from "@/lib/types";

const BED = Date.UTC(2026, 9, 4, 22, 41, 37);
const WOKE = Date.UTC(2026, 9, 5, 6, 12, 5);

function log(over: Partial<SleepLog> = {}): SleepLog {
  return {
    id: "s1",
    workspaceId: "w1",
    memberId: "m1",
    date: "2026-10-05",
    bedtimeAt: BED,
    wokeAt: WOKE,
    quality: null,
    fatigue: null,
    note: null,
    timesSource: "health_connect",
    asleepMin: 420,
    deepMin: 70,
    lightMin: 260,
    remMin: 90,
    awakeMin: 30,
    createdAt: WOKE,
    ...over,
  };
}

const minute = (ms: number) => Math.floor(ms / 60_000) * 60_000;

describe("keepDeviceTimes", () => {
  it("drops times that only echo the device's, to the minute", () => {
    const out = keepDeviceTimes(
      { date: "2026-10-05", bedtimeAt: minute(BED), wokeAt: minute(WOKE), quality: 5 },
      log(),
    );
    expect(out).toEqual({ date: "2026-10-05", quality: 5 });
  });

  it("drops blank times on a device night (the inbox form starts empty)", () => {
    const out = keepDeviceTimes({ date: "2026-10-05", bedtimeAt: null, wokeAt: null, fatigue: 3 }, log());
    expect(out).not.toHaveProperty("bedtimeAt");
    expect(out).not.toHaveProperty("wokeAt");
  });

  it("keeps times the member changed", () => {
    const input = { date: "2026-10-05", bedtimeAt: minute(BED) - 30 * 60_000, wokeAt: minute(WOKE) };
    expect(keepDeviceTimes(input, log())).toBe(input);
  });

  it("leaves manual nights and new nights as they are", () => {
    const input = { date: "2026-10-05", bedtimeAt: null, wokeAt: null };
    expect(keepDeviceTimes(input, log({ timesSource: "manual" }))).toBe(input);
    expect(keepDeviceTimes(input, undefined)).toBe(input);
  });
});

describe("isRatedLog", () => {
  it("is false for a row with only device times", () => {
    expect(isRatedLog(log())).toBe(false);
  });

  it("is true once rated or noted", () => {
    expect(isRatedLog(log({ quality: 4 }))).toBe(true);
    expect(isRatedLog(log({ fatigue: 2 }))).toBe(true);
    expect(isRatedLog(log({ note: "late coffee" }))).toBe(true);
  });
});
