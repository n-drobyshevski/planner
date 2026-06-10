"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { useQueryClient } from "@tanstack/react-query";
import { useIdlePreload } from "@/lib/lazy";
import { useIsMobile } from "@/hooks/use-mobile";
import { m, AnimatePresence } from "motion/react";
import { fade } from "@/lib/motion";
import { Loader2 } from "lucide-react";
import { useWorkspace } from "@/lib/hooks/use-workspace";
import { useTasks } from "@/lib/hooks/use-tasks";
import { useTaskMutations } from "@/lib/hooks/use-task-mutations";
import { resolveTaskColor } from "@/lib/tasks/colors";
import { groupByParent, progressOf } from "@/lib/tasks/tree";
import { combineDateTime } from "@/lib/datetime/local";
import { useViewerTimeZone } from "@/lib/datetime/timezone-context";
import { TasksToolbar, type TasksView } from "./tasks-toolbar";
import { TaskBoard } from "./task-board";
import { TaskList } from "./task-list";
import { LoadError } from "@/components/shared/load-error";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { TaskRow, TaskStatus } from "@/lib/types";

// Defer the task/schedule dialogs out of the initial /tasks JS (both portaled →
// null fallback, no layout cost). Warmed on idle via useIdlePreload so the
// common "open a task" stays instant. ScheduleTaskDialog shares its chunk with
// the calendar surface.
const loadTaskDialog = () => import("./task-dialog").then((m) => m.TaskDialog);
const TaskDialog = dynamic(loadTaskDialog, { ssr: false, loading: () => null });
const loadScheduleTaskDialog = () =>
  import("./schedule-task-dialog").then((m) => m.ScheduleTaskDialog);
const ScheduleTaskDialog = dynamic(loadScheduleTaskDialog, {
  ssr: false,
  loading: () => null,
});

/** Overlays warmed during idle so their first open is instant. */
const OVERLAY_PRELOADS = [loadTaskDialog, loadScheduleTaskDialog];

type EditorState =
  | { mode: "create"; status?: TaskStatus }
  | { mode: "edit"; taskId: string };

export function TasksShell({
  initialView,
  viewFromUrl,
  initialBoardId,
}: {
  initialView: TasksView;
  viewFromUrl: boolean;
  initialBoardId: string | null;
}) {
  const router = useRouter();
  const [view, setView] = useState<TasksView>(initialView);
  const [activeBoardId, setActiveBoardId] = useState<string | null>(initialBoardId);
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [scheduling, setScheduling] = useState<TaskRow | null>(null);
  const [deleting, setDeleting] = useState<TaskRow | null>(null);
  const isMobile = useIsMobile();
  const [mounted, setMounted] = useState(false);
  const autoApplied = useRef(false);

  useEffect(() => setMounted(true), []);
  // Warm the task/schedule dialog chunks during idle so first open is instant.
  useIdlePreload(OVERLAY_PRELOADS);

  // Phones default to the List view (the board's 3 columns don't fit) unless
  // the URL pinned a view. Run in an effect (not render-phase) so the
  // conditional setState can't trip rules-of-hooks; ref-guarded so a later
  // manual switch isn't clobbered. The URL stays clean; the first manual switch
  // syncs it.
  useEffect(() => {
    if (autoApplied.current) return;
    if (!viewFromUrl && isMobile) {
      autoApplied.current = true;
      setView("list");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once on first mobile detection
  }, [isMobile, viewFromUrl]);

  const workspace = useWorkspace();
  const workspaceId = workspace.data?.workspaceId;
  const timeZone = useViewerTimeZone();
  const { tasks, isLoading, isError } = useTasks(workspaceId);
  const mutations = useTaskMutations(workspaceId);

  const members = workspace.data?.members ?? [];
  const categories = workspace.data?.categories ?? [];
  const boards = useMemo(() => workspace.data?.boards ?? [], [workspace.data?.boards]);
  const memberMap = useMemo(() => new Map(members.map((m) => [m.id, m])), [members]);
  const catMap = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);
  const colorOf = (t: TaskRow) => resolveTaskColor(t, catMap, memberMap);

  // The active board: the URL/selected one if it still exists, else the first.
  // Deriving (rather than syncing into state) means a deleted/stale selection
  // transparently falls back to the first board — every consumer reads
  // `activeBoard?.id`, so creation and filtering stay correct without an effect.
  const activeBoard =
    boards.find((b) => b.id === activeBoardId) ?? boards[0] ?? null;

  // Only this board's tasks (subtasks inherit their parent's board).
  const boardTasks = useMemo(
    () => (activeBoard ? tasks.filter((t) => t.boardId === activeBoard.id) : []),
    [tasks, activeBoard],
  );

  // Tasks (incl. subtasks) per board, from the full set — for the switcher's
  // delete guard. Computed once here so the switcher needn't re-subscribe.
  const taskCountByBoard = useMemo(() => {
    const counts = new Map<string, number>();
    for (const t of tasks) {
      if (t.boardId) counts.set(t.boardId, (counts.get(t.boardId) ?? 0) + 1);
    }
    return counts;
  }, [tasks]);

  const childrenByParent = useMemo(() => groupByParent(boardTasks), [boardTasks]);
  const topLevel = childrenByParent.get(null) ?? [];
  const progressFor = (t: TaskRow) => {
    const c = childrenByParent.get(t.id) ?? [];
    return c.length ? progressOf(c) : null;
  };
  const editingTask =
    editor?.mode === "edit"
      ? tasks.find((t) => t.id === editor.taskId) ?? null
      : null;
  const editingSubtasks = editingTask
    ? childrenByParent.get(editingTask.id) ?? []
    : [];

  function syncUrl(v: TasksView, boardId: string | null) {
    const params = new URLSearchParams();
    params.set("view", v);
    if (boardId) params.set("board", boardId);
    router.replace(`/tasks?${params.toString()}`, { scroll: false });
  }

  function changeView(v: TasksView) {
    setView(v);
    syncUrl(v, activeBoard?.id ?? null);
  }

  function changeBoard(boardId: string) {
    setActiveBoardId(boardId);
    syncUrl(view, boardId);
  }

  const loading = workspace.isLoading || isLoading;
  const error = workspace.isError || isError;
  const qc = useQueryClient();
  // Technical hint to the console only; users get the human LoadError + Retry.
  useEffect(() => {
    if (error)
      console.warn(
        "[planner] Task data failed to load. If this is a fresh environment, make sure the Supabase schema is applied and seeded.",
      );
  }, [error]);

  return (
    <div className="flex h-dvh flex-col bg-background">
      <TasksToolbar
        view={view}
        onViewChange={changeView}
        onNewTask={() => setEditor({ mode: "create" })}
        currentMember={workspace.data?.currentMember ?? null}
        activeBoardId={activeBoard?.id ?? null}
        onBoardChange={changeBoard}
        taskCountByBoard={taskCountByBoard}
      />

      <main className="min-h-0 flex-1 overflow-hidden">
        {!mounted ? (
          <div className="h-full" />
        ) : error ? (
          <LoadError subject="tasks" onRetry={() => void qc.invalidateQueries()} />
        ) : loading ? (
          <Centered>
            <Loader2 className="size-5 animate-spin" />
          </Centered>
        ) : !activeBoard ? (
          <Centered>
            You don&apos;t have any boards yet. Use the “New board” button up top to
            create your first one.
          </Centered>
        ) : (
          // Crossfade the board/list swap instead of an instant cut. `initial=
          // {false}` paints the first view at once; only the manual switch
          // animates. The swap is a deliberate user action, so the brief
          // mode="wait" exit→enter never interrupts work.
          <AnimatePresence mode="wait" initial={false}>
            <m.div
              key={view}
              variants={fade}
              initial="initial"
              animate="animate"
              exit="exit"
              className="h-full"
            >
              {view === "board" ? (
                <TaskBoard
                  tasks={topLevel}
                  colorOf={colorOf}
                  members={memberMap}
                  progressOf={progressFor}
                  onOpen={(t) => setEditor({ mode: "edit", taskId: t.id })}
                  onToggleDone={(t) => void mutations.toggleDone(t)}
                  onMove={(t, status, position) => void mutations.move(t, status, position)}
                  onNew={(status) => setEditor({ mode: "create", status })}
                  onChangeColor={(t, color) => void mutations.update(t.id, { color }, { color: t.color })}
                  onDelete={(t) => setDeleting(t)}
                />
              ) : (
                <TaskList
                  tasks={topLevel}
                  colorOf={colorOf}
                  members={memberMap}
                  progressOf={progressFor}
                  onOpen={(t) => setEditor({ mode: "edit", taskId: t.id })}
                  onToggleDone={(t) => void mutations.toggleDone(t)}
                  onChangeColor={(t, color) => void mutations.update(t.id, { color }, { color: t.color })}
                  onDelete={(t) => setDeleting(t)}
                />
              )}
            </m.div>
          </AnimatePresence>
        )}
      </main>

      {editor &&
        workspace.data?.currentMember &&
        (editor.mode === "create" || editingTask) && (
          <TaskDialog
            open
            onOpenChange={(o) => {
              if (!o) setEditor(null);
            }}
            mode={editor.mode}
            workspaceId={workspace.data.workspaceId}
            currentMemberId={workspace.data.currentMember.id}
            boardId={activeBoard?.id ?? null}
            members={members}
            categories={categories}
            task={editingTask}
            subtasks={editingSubtasks}
            defaultStatus={editor.mode === "create" ? editor.status : undefined}
            onSchedule={
              editingTask
                ? () => {
                    setScheduling(editingTask);
                    setEditor(null);
                  }
                : undefined
            }
          />
        )}

      {scheduling && workspace.data && (
        <ScheduleTaskDialog
          open
          onOpenChange={(o) => !o && setScheduling(null)}
          task={scheduling}
          subtasks={childrenByParent.get(scheduling.id) ?? []}
          workspaceId={workspace.data.workspaceId}
          // A due date is a zone-free token; seed the dialog at 09:00 of that
          // day in the viewer's zone.
          defaultStartMs={
            scheduling.dueDate
              ? combineDateTime(scheduling.dueDate, "09:00", timeZone)
              : undefined
          }
        />
      )}

      <AlertDialog open={deleting !== null} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this task?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the task, its subtasks, and any blocks it placed on the
              calendar.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deleting) void mutations.remove(deleting.id);
                setDeleting(null);
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-full items-center justify-center p-8 text-center text-sm text-muted-foreground">
      <div className="max-w-xs">{children}</div>
    </div>
  );
}
