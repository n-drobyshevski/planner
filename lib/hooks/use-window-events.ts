"use client";

import { useEffect, useMemo } from "react";
import {
  useQuery,
  useQueryClient,
  keepPreviousData,
  type QueryClient,
} from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { fetchWindow } from "@/lib/supabase/queries";
import { subscribeWorkspace, type WorkspaceChange } from "@/lib/supabase/realtime";
import { qk } from "@/lib/supabase/query-keys";
import { expandEvents } from "@/lib/recurrence/expand";
import type { EventRow, Occurrence, TimeWindow } from "@/lib/types";

const EMPTY_SHARED: ReadonlySet<string> = new Set();

/** [start, end) epoch-ms span an event row touches, or null if untimed/recurring. */
function rowSpan(row: Record<string, unknown> | undefined): [number, number] | null {
  if (!row) return null;
  const startsAt = row.starts_at;
  if (typeof startsAt !== "string") return null;
  const start = Date.parse(startsAt);
  if (Number.isNaN(start)) return null;
  const endsAt = typeof row.ends_at === "string" ? Date.parse(row.ends_at) : NaN;
  return [start, Number.isNaN(endsAt) ? start : endsAt];
}

/**
 * Decide which window queries a single event change affects, and invalidate only
 * those. We can do this precisely only when the full new row is present and not
 * recurring — i.e. INSERTs (an UPDATE/DELETE's `old` row carries only the PK
 * under the default replica identity, so a moved/removed event could leave a
 * stale neighbour window). For everything we can't bound — UPDATE, DELETE,
 * recurring series, and override changes — fall back to invalidating all windows.
 */
function invalidateAffectedWindows(
  qc: QueryClient,
  workspaceId: string,
  change: WorkspaceChange,
) {
  const fallback = () =>
    qc.invalidateQueries({ queryKey: qk.eventsAll(workspaceId) });

  if (change.table !== "events" || change.eventType !== "INSERT") {
    return fallback();
  }
  const newRow = change.new as Record<string, unknown> | undefined;
  if (newRow?.rrule) return fallback(); // unbounded recurrence
  const span = rowSpan(newRow);
  if (!span) return fallback();

  const [evStart, evEnd] = span;
  qc.invalidateQueries({
    predicate: (query) => {
      const key = query.queryKey;
      // Window keys are ["events", workspaceId, start, end]; the all-events
      // prefix ["events", workspaceId] won't match (length guard).
      if (
        key.length !== 4 ||
        key[0] !== "events" ||
        key[1] !== workspaceId ||
        typeof key[2] !== "number" ||
        typeof key[3] !== "number"
      ) {
        return false;
      }
      const winStart = key[2];
      const winEnd = key[3];
      // Half-open overlap with fetchWindow's predicate (starts < winEnd, ends >= winStart).
      return evStart < winEnd && evEnd >= winStart;
    },
  });
}

/**
 * Live-invalidate the workspace's event queries on any realtime change. Split
 * out of `useWindowEvents` so the calendar can fetch several windows at once
 * (the prev/current/next swipe panes) without opening duplicate realtime
 * channels — call this once per screen, then `useWindowEvents` per window.
 *
 * Narrows event/override changes to the affected window(s) where possible. Also
 * refreshes the workspace bundle on category changes so a partner flipping a
 * context's Personal/Shared state (or renaming/recoloring/adding/deleting one)
 * propagates live — the bundle query is otherwise kept warm for 5 min and only
 * patched by the actor's own mutations. (Tasks have their own subscriber.)
 */
export function useWorkspaceRealtime(workspaceId: string | undefined) {
  const qc = useQueryClient();
  const sb = createClient();

  useEffect(() => {
    if (!workspaceId) return;
    return subscribeWorkspace(
      sb,
      workspaceId,
      (change) => {
        if (change.table === "categories") {
          // A category's owner/name/color drives derived jointness + the sidebar;
          // refetch the bundle so both calendars stay in sync.
          qc.invalidateQueries({ queryKey: qk.workspace });
          return;
        }
        if (change.table !== "events" && change.table !== "event_overrides") {
          return; // not an event-window concern
        }
        invalidateAffectedWindows(qc, workspaceId, change);
      },
      "main",
      {
        onStatus: (status, wasReconnect) => {
          // Changes may have been missed while the channel was down; refetch
          // the windows once on rejoin to reconcile.
          if (status === "subscribed" && wasReconnect) {
            void qc.invalidateQueries({ queryKey: qk.eventsAll(workspaceId) });
          } else if (status === "error") {
            console.warn("[planner] Events realtime channel error; live updates may lag until it reconnects.");
          }
        },
      },
    );
  }, [workspaceId, qc, sb]);
}

/**
 * Fetch events + overrides for a visible window and expand them into
 * occurrences. `keepPreviousData` holds the last window's results during a
 * refetch so the view never flashes empty while paging. Pair with
 * `useWorkspaceRealtime` for live updates.
 */
export function useWindowEvents(
  workspaceId: string | undefined,
  win: TimeWindow,
  sharedCategoryIds: ReadonlySet<string> = EMPTY_SHARED,
): {
  occurrences: Occurrence[];
  events: EventRow[];
  isLoading: boolean;
  /** true while (re)fetching — with keepPreviousData, stale results showing */
  isFetching: boolean;
  isError: boolean;
} {
  const sb = createClient();

  const query = useQuery({
    queryKey: workspaceId
      ? qk.window(workspaceId, win.start, win.end)
      : ["events", "disabled"],
    enabled: Boolean(workspaceId),
    queryFn: () => fetchWindow(sb, workspaceId as string, win),
    placeholderData: keepPreviousData,
  });

  const occurrences = useMemo<Occurrence[]>(
    () =>
      query.data
        ? expandEvents(query.data.events, query.data.overrides, win, sharedCategoryIds)
        : [],
    // Depend on the events/overrides arrays separately, not the whole WindowData
    // object: React Query's structural sharing keeps their references stable when
    // a refetch leaves them unchanged, so a realtime refetch that touched only
    // one (or a category-bundle change) doesn't force a full re-expansion of every
    // series. An optimistic patch rebuilds `events`, so it still re-expands (as it
    // must, to reflect the change). win identity changes each render → depend on
    // its primitive bounds; the shared-id set is memoized by the caller.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [query.data?.events, query.data?.overrides, win.start, win.end, sharedCategoryIds],
  );

  return {
    occurrences,
    events: query.data?.events ?? [],
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    isError: query.isError,
  };
}
