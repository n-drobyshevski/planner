import { HydrationBoundary, QueryClient, dehydrate } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/server";
import {
  fetchWorkspaceBundle,
  fetchTasks,
  fetchTaskDependencies,
  fetchTaskStatusEvents,
  fetchTaskBlocks,
  fetchTaskCheckpoints,
} from "@/lib/supabase/queries";
import { qk } from "@/lib/supabase/query-keys";
import type { WorkspaceData } from "@/lib/hooks/use-workspace";
import type { TasksView } from "@/components/tasks/tasks-toolbar";

/**
 * Server-seed the tasks surface's first paint — the tasks twin of
 * `calendar-data-seed.tsx`.
 *
 * TasksShell paints behind `workspace.isLoading || useTasks.isLoading`, and
 * `useTasks` is only enabled once the workspace fetch returns, so today the
 * board/list waits on TWO serial browser→eu-central round-trips. Here we run the
 * same reads on the server (fra1, next to the DB) and dehydrate them into React
 * Query, so the client hooks find the data already present on first render — no
 * fetch waterfall. Realtime still attaches client-side; the global 5-min
 * staleTime means the fresh seed isn't refetched.
 *
 * Unlike the calendar seed there is NO timezone caveat: every task query key is
 * `[name, workspaceId]` (no time window), so seeding is unconditional.
 *
 * View-aware: the all-views set (workspace + tasks + dependencies — deps drive
 * blocked-state styling everywhere) is seeded always; the three Flows-only
 * datasets are seeded only when the entry URL is `?view=flows`, so common
 * board/list loads don't pay to fetch + serialize data they never show.
 *
 * Placement: dynamic (per-user; reads the auth cookie), sits INSIDE the route's
 * Suspense boundary so the static shell + skeleton still prerender (route stays
 * ◐ Partial Prerender); only the seed streams. Wraps the unchanged `"use cache"`
 * CachedTasks without moving per-user data into the cached scope.
 *
 * Resilience: best-effort. Any failure (unauthenticated, RLS, transient) skips
 * the seed and renders children, which fall back to the client fetches.
 */
export async function TasksDataSeed({
  view,
  children,
}: {
  view: TasksView;
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
      const wsId = bundle.workspaceId;
      const currentMember =
        bundle.members.find((m) => m.authUserId === userId) ?? null;

      // The exact shape useWorkspace returns — the only entry needing a transform
      // (a mismatch would make the hook refetch and erase the win).
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

      // Everything else depends only on wsId → fetch in parallel. The Flows-only
      // datasets are skipped (null) unless this is a `?view=flows` entry.
      const flows = view === "flows";
      const [tasks, deps, statusEvents, blocks, checkpoints] = await Promise.all([
        fetchTasks(sb, wsId),
        fetchTaskDependencies(sb, wsId),
        flows ? fetchTaskStatusEvents(sb, wsId) : Promise.resolve(null),
        flows ? fetchTaskBlocks(sb, wsId) : Promise.resolve(null),
        flows ? fetchTaskCheckpoints(sb, wsId) : Promise.resolve(null),
      ]);

      // Pure drop-ins: each hook caches its fetch* return directly under these keys.
      queryClient.setQueryData(qk.tasks(wsId), tasks);
      queryClient.setQueryData(qk.taskDependencies(wsId), deps);
      if (statusEvents) queryClient.setQueryData(qk.taskStatusEvents(wsId), statusEvents);
      if (blocks) queryClient.setQueryData(qk.taskBlocks(wsId), blocks);
      if (checkpoints) queryClient.setQueryData(qk.taskCheckpoints(wsId), checkpoints);
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
