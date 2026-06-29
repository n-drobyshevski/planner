import { HydrationBoundary, QueryClient, dehydrate } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/server";
import { fetchWorkspaceBundle, fetchWindow } from "@/lib/supabase/queries";
import { getWindow } from "@/lib/datetime/window";
import { qk } from "@/lib/supabase/query-keys";
import type { WorkspaceData } from "@/lib/hooks/use-workspace";
import type { CalendarView } from "@/lib/types";

/**
 * Server-seed the calendar's first paint.
 *
 * CalendarShell needs two queries before its grid can render — the workspace
 * bundle (`useWorkspace`) and the focused window's events (`useWindowEvents`) —
 * and today fetches BOTH from the browser, serially (the window depends on the
 * member's timezone, which only the bundle carries). For a viewer far from the
 * eu-central DB that waterfall is the dominant LCP contributor.
 *
 * Here we run the same two reads on the server (fra1, adjacent to the DB) and
 * dehydrate them into React Query's cache. The client hooks then find the data
 * already present on first render, so the grid paints without any browser→DB
 * roundtrip. Realtime still attaches client-side and keeps the data live; the
 * 5-min staleTime means the fresh seed is served from cache without an immediate
 * refetch.
 *
 * Placement: this component is dynamic (per-user; reads the auth cookie) and
 * sits INSIDE the calendar route's Suspense boundary, so the static shell +
 * skeleton still prerender — only the seeded data streams. It wraps the cached
 * `CachedCalendar` scope without moving any per-user data into `"use cache"`.
 *
 * Resilience: the seed is best-effort. Any failure (unauthenticated, RLS,
 * transient) skips it and renders children, which fall back to the original
 * client fetches — never worse than before.
 */
export async function CalendarDataSeed({
  view,
  dateMs,
  children,
}: {
  view: CalendarView;
  dateMs: number;
  children: React.ReactNode;
}) {
  const queryClient = new QueryClient();

  try {
    const sb = await createClient();
    // Reads the user id from the validated session cookie (no Auth roundtrip),
    // mirroring useWorkspace so the seeded `currentMember` matches exactly.
    const { data: claims } = await sb.auth.getClaims();
    const userId = claims?.claims?.sub as string | undefined;

    if (userId) {
      const bundle = await fetchWorkspaceBundle(sb);
      const currentMember =
        bundle.members.find((m) => m.authUserId === userId) ?? null;

      // Build the exact WorkspaceData shape useWorkspace returns so the entry is
      // a drop-in (a mismatched shape would make the hook refetch, negating the
      // win).
      const workspaceData: WorkspaceData = {
        workspaceId: bundle.workspaceId,
        workspaceName: bundle.workspaceName,
        members: bundle.members,
        categories: bundle.categories,
        collections: bundle.collections,
        boards: bundle.boards,
        currentMember,
        sleepPrefs: bundle.sleepPrefs,
      };
      queryClient.setQueryData(qk.workspace, workspaceData);

      // The focused window can be pre-seeded ONLY when the viewer has an explicit
      // timezone: otherwise CalendarShell computes the window in the device zone
      // (unknown on the server), so the cache key wouldn't match and the client
      // would refetch. Seeding just the bundle still collapses the serial
      // workspace→events waterfall — the client fires the window fetch on the
      // first render with wsId + timezone already in hand.
      const timeZone = currentMember?.timezone;
      if (timeZone) {
        const win = getWindow(view, dateMs, { timeZone });
        const windowData = await fetchWindow(sb, bundle.workspaceId, win);
        queryClient.setQueryData(
          qk.window(bundle.workspaceId, win.start, win.end),
          windowData,
        );
      }
    }
  } catch {
    // Best-effort: fall through to the client fetches on any failure.
  }

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      {children}
    </HydrationBoundary>
  );
}
