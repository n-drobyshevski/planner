"use client";

import { useMemo, useSyncExternalStore } from "react";
import { useQuery } from "@tanstack/react-query";

import { createClient } from "@/lib/supabase/client";
import {
  fetchTasks,
  fetchSleepLogs,
  fetchTimeslotRequests,
} from "@/lib/supabase/queries";
import { qk } from "@/lib/supabase/query-keys";
import { useWorkspace } from "@/lib/hooks/use-workspace";
import { useWindowEvents } from "@/lib/hooks/use-window-events";
import { useViewerTimeZone } from "@/lib/datetime/timezone-context";
import { dayStartOffset } from "@/lib/datetime/local";
import {
  deriveInboxItems,
  RATE_N,
  type InboxItem,
} from "@/lib/inbox/derive";
import type { TimeWindow } from "@/lib/types";

/** Fallback when sleep prefs haven't loaded (mirrors the DB defaults). */
const DEFAULT_NIGHT = { startHour: 20, endHour: 12 };

const DAY = 86_400_000;

// Client-only "now", bucketed to the day. The badge lives in the always-mounted
// nav chrome, which Cache Components statically prerenders — and a `Date.now()`
// read in a client component without a Suspense boundary above it is rejected as
// dynamic. useSyncExternalStore keeps the read on the client (getServerSnapshot
// returns 0, so prerender never calls Date.now()), and the day bucket keeps the
// snapshot referentially stable within a render so it doesn't loop or churn the
// derivation; it advances only when the day actually rolls over.
let dayAnchor = 0;
function nowSnapshot(): number {
  const t = Date.now();
  if (dayAnchor === 0 || Math.floor(t / DAY) !== Math.floor(dayAnchor / DAY)) {
    dayAnchor = t;
  }
  return dayAnchor;
}
function subscribeNow(onChange: () => void): () => void {
  const id = setInterval(onChange, 60_000);
  if (typeof document !== "undefined") {
    document.addEventListener("visibilitychange", onChange);
  }
  return () => {
    clearInterval(id);
    if (typeof document !== "undefined") {
      document.removeEventListener("visibilitychange", onChange);
    }
  };
}

/**
 * The viewer's inbox rows, derived from already-cached workspace data.
 *
 * A PURE READER: it queries the same keys the surfaces use (so the cache is
 * shared and there's one fetch), but opens NO realtime channel of its own. The
 * count badge lives in the always-mounted chrome, and duplicating the
 * tasks/sleep channels there would collide with the active surface's. Liveness
 * is fine without it: resolving a row patches the shared cache optimistically
 * (so the row leaves live), the active surfaces keep tasks/sleep fresh, and a
 * focus refetch catches the rest. A calm count, not a real-time alarm.
 */
export function useInboxItems(): { items: InboxItem[]; isLoading: boolean } {
  const sb = createClient();
  const { data: ws, isLoading: wsLoading } = useWorkspace();
  const wsId = ws?.workspaceId;
  const viewerId = ws?.currentMember?.id;
  const timeZone = useViewerTimeZone();

  // Day-aligned "now" (client-only; 0 during prerender) so the badge (chrome) and
  // the /inbox shell build the same window key within a day → one shared fetch.
  const now = useSyncExternalStore(subscribeNow, nowSnapshot, () => 0);
  // `now === 0` means we're in the static prerender of the nav chrome. The date
  // helpers (date-fns/tz) call `new Date()` internally, which Cache Components
  // rejects outside a Suspense boundary — so every clock-touching computation
  // below is gated until the client supplies a real `now`.
  const ready = now > 0;

  // Only rate-event reads occurrences, and only within RATE_N days; a one-day
  // buffer covers the half-open boundary. Sleep uses the (un-windowed) log set.
  const win: TimeWindow = useMemo(
    () =>
      ready
        ? {
            start: dayStartOffset(now, -(RATE_N + 1), timeZone),
            end: dayStartOffset(now, 1, timeZone),
          }
        : { start: 0, end: 0 },
    [ready, now, timeZone],
  );

  const sharedCategoryIds = useMemo(
    () =>
      new Set(
        (ws?.categories ?? []).filter((c) => c.ownerId === null).map((c) => c.id),
      ),
    [ws?.categories],
  );

  const { occurrences, isLoading: evLoading } = useWindowEvents(
    wsId,
    win,
    sharedCategoryIds,
  );

  const tasksQuery = useQuery({
    queryKey: wsId ? qk.tasks(wsId) : ["tasks", "disabled"],
    enabled: Boolean(wsId),
    queryFn: () => fetchTasks(sb, wsId as string),
  });
  const sleepQuery = useQuery({
    queryKey:
      wsId && viewerId ? qk.sleepLogs(wsId, viewerId) : ["sleep-logs", "disabled"],
    enabled: Boolean(wsId && viewerId),
    queryFn: () => fetchSleepLogs(sb, wsId as string, viewerId as string),
  });
  // Pending public-share timeslot requests (RLS returns only the owner's). Shares
  // the inbox's focus-refetch liveness model — no realtime channel of its own.
  const requestsQuery = useQuery({
    queryKey: wsId ? qk.timeslotRequests(wsId) : ["timeslot-requests", "disabled"],
    enabled: Boolean(wsId),
    queryFn: () => fetchTimeslotRequests(sb, wsId as string),
  });

  const sleepPrefs = ws?.sleepPrefs;
  const items = useMemo(() => {
    if (!ready || !viewerId) return [];
    const sleepLogDates = new Set((sleepQuery.data ?? []).map((l) => l.date));
    const nightWindow = sleepPrefs
      ? {
          startHour: sleepPrefs.nightWindowStartHour,
          endHour: sleepPrefs.nightWindowEndHour,
        }
      : DEFAULT_NIGHT;
    return deriveInboxItems({
      occurrences,
      tasks: tasksQuery.data ?? [],
      sleepLogDates,
      requests: requestsQuery.data ?? [],
      viewerId,
      now,
      timeZone,
      nightWindow,
    });
  }, [ready, occurrences, tasksQuery.data, sleepQuery.data, requestsQuery.data, viewerId, now, timeZone, sleepPrefs]);

  const isLoading =
    wsLoading ||
    evLoading ||
    tasksQuery.isLoading ||
    sleepQuery.isLoading ||
    requestsQuery.isLoading;
  return { items, isLoading };
}

/** Just the count, for the nav badge. */
export function useInboxCount(): number {
  return useInboxItems().items.length;
}
