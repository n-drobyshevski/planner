"use client";

import { useCallback } from "react";
import { useTranslations } from "next-intl";

import { createClient } from "@/lib/supabase/client";
import { fetchWindow } from "@/lib/supabase/queries";
import { expandEvents } from "@/lib/recurrence/expand";
import { useEventMutations } from "@/lib/hooks/use-event-mutations";
import { usePreferences } from "@/lib/hooks/use-preferences";
import { isViewerSleep } from "@/lib/sleep/viewer-sleep";
import { nightWindowFor } from "@/lib/sleep/derive";
import { planSleepBlockSync } from "@/lib/sleep/sync-block";
import type { EventInput } from "@/lib/supabase/mappers";

export interface SyncSleepBlockInput {
  /** wake date "yyyy-MM-dd" in the viewer's zone */
  date: string;
  /** logged bedtime / wake, epoch ms (both required) */
  bedtimeAt: number;
  wokeAt: number;
}

/**
 * Snap the viewer's calendar sleep block for one night to the times they just
 * logged, creating one if none exists. The Sleep tab calls the returned function
 * after a check-in save when the auto-adjust pref is on and both times are set.
 *
 * Resolution runs against the master event series (a fresh window fetch + expand)
 * rather than only the period the tab has loaded, so backfilling any past night
 * still finds — and adjusts — the right block. The event mutations carry their
 * own optimistic update + undoable toast (and the sleep-log save is silent on
 * success), so the member sees one "Sleep block updated · Undo" confirmation.
 *
 * `timeZone` is passed in (the tab's viewer zone) so the night window the sync
 * computes matches the chart's deriveNights byte-for-byte; the sleep category and
 * window hours come from the same member-private prefs the tab reads.
 */
export function useSleepBlockSync(
  workspaceId: string | undefined,
  viewerId: string | undefined,
  sharedCategoryIds: ReadonlySet<string>,
  timeZone: string,
): (input: SyncSleepBlockInput) => Promise<void> {
  const mutations = useEventMutations(workspaceId);
  const { sleepCategoryId, nightWindowStartHour, nightWindowEndHour } = usePreferences();
  const t = useTranslations("insights");

  return useCallback(
    async ({ date, bedtimeAt, wokeAt }) => {
      if (!workspaceId || !viewerId) return;

      const { winStart, winEnd } = nightWindowFor(
        date,
        timeZone,
        nightWindowStartHour,
        nightWindowEndHour,
      );
      const win = { start: winStart, end: winEnd };

      // Authoritative resolution: fetch the night window, expand the series, and
      // keep only the viewer's own sleep occurrences (same gate as the chart).
      const sb = createClient();
      const data = await fetchWindow(sb, workspaceId, win);
      const occurrences = expandEvents(
        data.events,
        data.overrides,
        win,
        sharedCategoryIds,
      ).filter((o) => isViewerSleep(o, viewerId, sleepCategoryId));

      const plan = planSleepBlockSync({
        date,
        bedtimeAt,
        wokeAt,
        viewerSleepOccurrences: occurrences,
        timeZone,
        startHour: nightWindowStartHour,
        endHour: nightWindowEndHour,
      });

      if (plan.action === "create") {
        const input: EventInput = {
          workspaceId,
          ownerId: viewerId,
          title: t("sleep.blockTitle"),
          start: plan.start,
          end: plan.end,
          timeZone,
          // With a dedicated sleep category, file it there; otherwise mark it
          // inactive so the inactive≡sleep heuristic re-derives it as a night.
          categoryId: sleepCategoryId,
          inactive: sleepCategoryId === null,
          status: "confirmed",
          isShared: false,
          isPrivate: false,
        };
        await mutations.create(input);
        return;
      }

      if (plan.action === "update-single") {
        await mutations.updateSingle(plan.eventId, {
          start: plan.start,
          end: plan.end,
        });
        return;
      }

      // override: a recurring routine — adjust this night only, never the series.
      const master = data.events.find((e) => e.id === plan.eventId);
      if (!master) return; // series not in window (shouldn't happen) — skip, don't guess
      await mutations.editThis(master, plan.occurrenceMs, {
        start: plan.start,
        end: plan.end,
      });
    },
    [
      workspaceId,
      viewerId,
      sharedCategoryIds,
      sleepCategoryId,
      nightWindowStartHour,
      nightWindowEndHour,
      timeZone,
      mutations,
      t,
    ],
  );
}
