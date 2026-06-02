"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useIsMobile } from "@/hooks/use-mobile";
import { Loader2 } from "lucide-react";
import { useWorkspace } from "@/lib/hooks/use-workspace";
import { useTasks } from "@/lib/hooks/use-tasks";
import { useTaskMutations } from "@/lib/hooks/use-task-mutations";
import { resolveTaskColor } from "@/lib/tasks/colors";
import { groupByParent, progressOf } from "@/lib/tasks/tree";
import { TasksToolbar, type TasksView } from "./tasks-toolbar";
import { TaskBoard } from "./task-board";
import { TaskList } from "./task-list";
import { TaskDialog } from "./task-dialog";
import { ScheduleTaskDialog } from "./schedule-task-dialog";
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

type EditorState =
  | { mode: "create"; status?: TaskStatus }
  | { mode: "edit"; taskId: string };

export function TasksShell({
  initialView,
  viewFromUrl,
}: {
  initialView: TasksView;
  viewFromUrl: boolean;
}) {
  const router = useRouter();
  const [view, setView] = useState<TasksView>(initialView);
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [scheduling, setScheduling] = useState<TaskRow | null>(null);
  const [deleting, setDeleting] = useState<TaskRow | null>(null);
  const isMobile = useIsMobile();
  const [mounted, setMounted] = useState(false);
  const autoApplied = useRef(false);

  useEffect(() => setMounted(true), []);

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
  const { tasks, isLoading, isError } = useTasks(workspaceId);
  const mutations = useTaskMutations(workspaceId);

  const members = workspace.data?.members ?? [];
  const categories = workspace.data?.categories ?? [];
  const memberMap = useMemo(() => new Map(members.map((m) => [m.id, m])), [members]);
  const catMap = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);
  const colorOf = (t: TaskRow) => resolveTaskColor(t, catMap, memberMap);

  const childrenByParent = useMemo(() => groupByParent(tasks), [tasks]);
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

  function changeView(v: TasksView) {
    setView(v);
    router.replace(`/tasks?view=${v}`, { scroll: false });
  }

  const loading = workspace.isLoading || isLoading;
  const error = workspace.isError || isError;

  return (
    <div className="flex h-dvh flex-col bg-background">
      <TasksToolbar
        view={view}
        onViewChange={changeView}
        onNewTask={() => setEditor({ mode: "create" })}
        currentMember={workspace.data?.currentMember ?? null}
      />

      <main className="min-h-0 flex-1 overflow-hidden">
        {!mounted ? (
          <div className="h-full" />
        ) : error ? (
          <Centered>
            Couldn&apos;t load your tasks. Make sure the database schema is applied
            and seeded.
          </Centered>
        ) : loading ? (
          <Centered>
            <Loader2 className="size-5 animate-spin" />
          </Centered>
        ) : view === "board" ? (
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
          defaultStartMs={scheduling.dueAt ?? undefined}
        />
      )}

      <AlertDialog open={deleting !== null} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this task?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the task, its subtasks, and any blocks it placed on the
              calendar. This can&apos;t be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deleting) void mutations.remove(deleting.id);
                setDeleting(null);
              }}
              className="bg-destructive text-white hover:bg-destructive/90"
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
