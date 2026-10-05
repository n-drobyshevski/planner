import type { SleepLogInput } from "@/lib/supabase/mappers";
import type { SleepLog } from "@/lib/types";

const MIN_MS = 60_000;

type NightInput = Omit<SleepLogInput, "workspaceId" | "memberId">;

/**
 * A night counts as logged once the member rated it (or wrote a note). A row
 * Health Connect created only carries times and stages, so the morning
 * check-in and the inbox still ask for the ratings.
 */
export function isRatedLog(log: SleepLog): boolean {
  return log.quality !== null || log.fatigue !== null || log.note !== null;
}

/**
 * Drops the times from a check-in that would only echo the device's: on a
 * night synced from Health Connect, blank times (the inbox form starts
 * empty) and times equal to the stored ones to the minute (the forms prefill
 * them at minute precision) leave the device's times and source alone.
 * Times the member actually changed go through and become manual.
 */
export function keepDeviceTimes(input: NightInput, existing: SleepLog | undefined): NightInput {
  if (existing?.timesSource !== "health_connect") return input;
  const bed = input.bedtimeAt ?? null;
  const woke = input.wokeAt ?? null;
  const blank = bed === null && woke === null;
  const same =
    sameMinute(bed, existing.bedtimeAt) && sameMinute(woke, existing.wokeAt);
  if (!blank && !same) return input;
  const rest = { ...input };
  delete rest.bedtimeAt;
  delete rest.wokeAt;
  return rest;
}

function sameMinute(a: number | null, b: number | null): boolean {
  if (a === null || b === null) return a === b;
  return Math.floor(a / MIN_MS) === Math.floor(b / MIN_MS);
}
