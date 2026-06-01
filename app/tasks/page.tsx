import { TasksShell } from "@/components/tasks/tasks-shell";

export default async function TasksPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const sp = await searchParams;
  const initialView = sp.view === "list" ? "list" : "board";
  const viewFromUrl = sp.view === "list" || sp.view === "board";
  return <TasksShell initialView={initialView} viewFromUrl={viewFromUrl} />;
}
