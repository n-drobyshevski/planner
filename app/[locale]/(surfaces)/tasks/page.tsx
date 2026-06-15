import { Suspense } from "react";
import { cacheLife } from "next/cache";
import { TasksShell } from "@/components/tasks/tasks-shell";
import { TasksSkeleton } from "@/components/shared/surface-skeletons";
import type { TasksView } from "@/components/tasks/tasks-toolbar";

// searchParams is request-time data; behind Suspense so the static shell can
// prerender while the params-dependent shell streams in (Cache Components).
// The skeleton fallback prerenders into the shell too: cold loads paint
// header + placeholder.
export default function TasksPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; collection?: string }>;
}) {
  return (
    <Suspense fallback={<TasksSkeleton />}>
      <TasksRoute searchParams={searchParams} />
    </Suspense>
  );
}

async function TasksRoute({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; collection?: string }>;
}) {
  const sp = await searchParams;
  // Params are normalized OUT here, in the dynamic scope; the plain results
  // become the cache key below (one entry per view/collection combination).
  const initialView: TasksView =
    sp.view === "list" ? "list" : sp.view === "flows" ? "flows" : "board";
  const viewFromUrl =
    sp.view === "list" || sp.view === "board" || sp.view === "flows";
  return (
    <CachedTasks
      view={initialView}
      viewFromUrl={viewFromUrl}
      collectionId={sp.collection ?? null}
    />
  );
}

/**
 * The RSC payload for a given (view, collection) is pure code-derived UI — all
 * data is client-fetched — so it's cached: repeat visits skip the server
 * render, and within the profile's client `stale` window the router serves
 * surface back-navigation from browser memory with no roundtrip at all.
 */
async function CachedTasks({
  view,
  viewFromUrl,
  collectionId,
}: {
  view: TasksView;
  viewFromUrl: boolean;
  collectionId: string | null;
}) {
  "use cache";
  cacheLife("hours");
  return (
    <TasksShell
      initialView={view}
      viewFromUrl={viewFromUrl}
      initialCollectionId={collectionId}
    />
  );
}
