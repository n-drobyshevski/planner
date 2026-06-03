import { Suspense } from "react";
import { TasksShell } from "@/components/tasks/tasks-shell";

// searchParams is request-time data; behind Suspense so the static shell can
// prerender while the params-dependent shell streams in (Cache Components).
export default function TasksPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; board?: string }>;
}) {
  return (
    <Suspense fallback={null}>
      <TasksRoute searchParams={searchParams} />
    </Suspense>
  );
}

async function TasksRoute({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; board?: string }>;
}) {
  const sp = await searchParams;
  const initialView = sp.view === "list" ? "list" : "board";
  const viewFromUrl = sp.view === "list" || sp.view === "board";
  return (
    <TasksShell
      initialView={initialView}
      viewFromUrl={viewFromUrl}
      initialBoardId={sp.board ?? null}
    />
  );
}
