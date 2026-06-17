"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import dynamic from "next/dynamic";
import { useQueryClient } from "@tanstack/react-query";
import { useIdlePreload } from "@/lib/lazy";
import { useIsMobile } from "@/hooks/use-mobile";
import { m, AnimatePresence } from "motion/react";
import { fade } from "@/lib/motion";
import { Spinner } from "@/components/ui/spinner";
import { useWorkspace } from "@/lib/hooks/use-workspace";
import { useTasks } from "@/lib/hooks/use-tasks";
import { useTaskStatusEvents } from "@/lib/hooks/use-task-status-events";
import { useTaskBlocks } from "@/lib/hooks/use-task-blocks";
import { useTaskCheckpoints } from "@/lib/hooks/use-task-checkpoints";
import { useTaskMutations } from "@/lib/hooks/use-task-mutations";
import { useTaskDialogs } from "@/lib/hooks/use-task-dialogs";
import { useFlowsDisplay } from "@/lib/hooks/use-flows-display";
import { resolveTaskColor } from "@/lib/tasks/colors";
import { groupByParent, progressOf } from "@/lib/tasks/tree";
import { positionBetween } from "@/lib/tasks/ordering";
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
import type { TaskActions } from "./task-actions";
import type { EventRow, TaskCheckpoint, TaskRow, TaskStatusEvent } from "@/lib/types";

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
const loadCheckpointDialog = () =>
  import("./checkpoint-dialog").then((m) => m.CheckpointDialog);
const CheckpointDialog = dynamic(loadCheckpointDialog, {
  ssr: false,
  loading: () => null,
});

// The Flows view carries the SVG/zoom weight, so it's code-split out of the
// initial /tasks JS (Board/List stay inline as the common defaults) and warmed
// on idle so the first switch is instant.
const loadTaskFlows = () => import("./task-flows").then((m) => m.TaskFlows);
const TaskFlows = dynamic(loadTaskFlows, { ssr: false, loading: () => null });

/** Overlays + the Flows view, warmed during idle so their first open is instant. */
const OVERLAY_PRELOADS = [
  loadTaskDialog,
  loadScheduleTaskDialog,
  loadCheckpointDialog,
  loadTaskFlows,
];

export function TasksShell({
  initialView,
  viewFromUrl,
  initialCollectionId,
}: {
  initialView: TasksView;
  viewFromUrl: boolean;
  initialCollectionId: string | null;
}) {
  const t = useTranslations("tasks");
  const tc = useTranslations("common");
  const router = useRouter();
  const [view, setView] = useState<TasksView>(initialView);
  const [activeCollectionId, setActiveCollectionId] = useState<string | null>(
    initialCollectionId,
  );
  // One-shot signal telling the Flows view to expand a lane after a subtask was
  // added to it from that view's context menu. The bumping `key` lets Flows act
  // on each add even when the same parent is targeted twice.
  const [expandLane, setExpandLane] = useState<{
    id: string;
    key: number;
  } | null>(null);
  const dialogs = useTaskDialogs();
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
  // Status-change history powers the Flows view; it loads alongside tasks and
  // its own loading state gates only that view's skeleton.
  const { events, isLoading: eventsLoading } = useTaskStatusEvents(workspaceId);
  // Task-linked calendar blocks power the Flows view's scheduled markers.
  const { blocks, isLoading: blocksLoading } = useTaskBlocks(workspaceId);
  // Milestone checkpoints power the Flows view's per-flow markers.
  const { checkpoints } = useTaskCheckpoints(workspaceId);
  const mutations = useTaskMutations(workspaceId);

  const members = workspace.data?.members ?? [];
  const categories = workspace.data?.categories ?? [];
  const collections = useMemo(
    () => workspace.data?.collections ?? [],
    [workspace.data?.collections],
  );
  const allBoards = useMemo(
    () => workspace.data?.boards ?? [],
    [workspace.data?.boards],
  );
  const memberMap = useMemo(
    () => new Map(members.map((m) => [m.id, m])),
    [members],
  );
  const catMap = useMemo(
    () => new Map(categories.map((c) => [c.id, c])),
    [categories],
  );
  const colorOf = (t: TaskRow) => resolveTaskColor(t, catMap, memberMap);

  // The active collection: the URL/selected one if it still exists, else the
  // first. Deriving (rather than syncing into state) means a deleted/stale
  // selection transparently falls back to the first collection — every consumer
  // reads `activeCollection?.id`, so creation and filtering stay correct without
  // an effect.
  const activeCollection =
    collections.find((c) => c.id === activeCollectionId) ??
    collections[0] ??
    null;

  // Flows side-panel display settings (filter / group / sort), persisted per
  // collection. DnD order persists server-side via the move mutation.
  const [flowsDisplay, setFlowsDisplay, resetFlowsDisplay] = useFlowsDisplay(
    activeCollection?.id ?? null,
  );

  // Only this collection's tasks (subtasks inherit their parent's collection).
  const collectionTasks = useMemo(
    () =>
      activeCollection
        ? tasks.filter((t) => t.collectionId === activeCollection.id)
        : [],
    [tasks, activeCollection],
  );

  // Tasks (incl. subtasks) per collection, from the full set — for the
  // switcher's delete guard. Computed once here so the switcher needn't
  // re-subscribe.
  const taskCountByCollection = useMemo(() => {
    const counts = new Map<string, number>();
    for (const t of tasks) {
      if (t.collectionId)
        counts.set(t.collectionId, (counts.get(t.collectionId) ?? 0) + 1);
    }
    return counts;
  }, [tasks]);

  // The active collection's columns, ordered. Drives the board/list grouping and
  // the per-board Flows line style.
  const activeBoards = useMemo(
    () =>
      activeCollection
        ? allBoards
            .filter((b) => b.collectionId === activeCollection.id)
            .sort((a, b) => a.position - b.position)
        : [],
    [allBoards, activeCollection],
  );
  const lineStyleOf = useMemo(() => {
    const byId = new Map(allBoards.map((b) => [b.id, b.lineStyle]));
    return (t: TaskRow) =>
      t.boardId ? (byId.get(t.boardId) ?? "solid") : "solid";
  }, [allBoards]);

  const childrenByParent = useMemo(
    () => groupByParent(collectionTasks),
    [collectionTasks],
  );
  const topLevel = childrenByParent.get(null) ?? [];

  // Status events grouped by task id, for the Flows view's per-lane timelines.
  const eventsByTask = useMemo(() => {
    const map = new Map<string, TaskStatusEvent[]>();
    for (const e of events) {
      const arr = map.get(e.taskId);
      if (arr) arr.push(e);
      else map.set(e.taskId, [e]);
    }
    return map;
  }, [events]);
  // Linked calendar blocks grouped by task id, for the Flows scheduled markers.
  const blocksByTask = useMemo(() => {
    const map = new Map<string, EventRow[]>();
    for (const b of blocks) {
      if (!b.taskId) continue;
      const arr = map.get(b.taskId);
      if (arr) arr.push(b);
      else map.set(b.taskId, [b]);
    }
    return map;
  }, [blocks]);
  // Checkpoints grouped by task id, for the Flows per-flow milestone markers.
  const checkpointsByTask = useMemo(() => {
    const map = new Map<string, TaskCheckpoint[]>();
    for (const c of checkpoints) {
      const arr = map.get(c.taskId);
      if (arr) arr.push(c);
      else map.set(c.taskId, [c]);
    }
    return map;
  }, [checkpoints]);
  const progressFor = (t: TaskRow) => {
    const c = childrenByParent.get(t.id) ?? [];
    return c.length ? progressOf(c) : null;
  };
  const editorState = dialogs.editor;
  const editingTask =
    editorState?.mode === "edit"
      ? (tasks.find((t) => t.id === editorState.taskId) ?? null)
      : null;
  const editingSubtasks = editingTask
    ? (childrenByParent.get(editingTask.id) ?? [])
    : [];

  // One grouped prop for the views instead of a six-way handler drill.
  const actions: TaskActions = {
    open: (t) => dialogs.openEdit(t.id),
    toggleDone: (t) => void mutations.toggleDone(t),
    move: (t, boardId, position) => void mutations.move(t, boardId, position),
    reorderFlow: (t, flowPos) => void mutations.reorderFlow(t, flowPos),
    create: (boardId) => dialogs.openCreate(boardId),
    addSubtask: (t) => dialogs.openCreate(undefined, t.id),
    // Drag-to-nest: append the child after the parent's existing subtasks, and
    // nudge Flows to expand the parent so the new branch is visible at once.
    reparent: (child, parentId) => {
      const siblings = childrenByParent.get(parentId) ?? [];
      const last = siblings[siblings.length - 1];
      void mutations.reparent(child, parentId, positionBetween(last?.position ?? null, null));
      setExpandLane((prev) => ({ id: parentId, key: (prev?.key ?? 0) + 1 }));
    },
    // Un-nest back to a top-level task (the mutation computes its landing spot).
    promote: (child) => void mutations.promote(child),
    changeColor: (t, color) =>
      void mutations.update(t.id, { color }, { color: t.color }, { color }),
    remove: (t) => dialogs.openDelete(t),
    addCheckpoint: (t, atDate) => dialogs.openCreateCheckpoint(t.id, atDate),
    openCheckpoint: (checkpointId) => dialogs.openEditCheckpoint(checkpointId),
  };

  // The checkpoint editor's target, resolved from the live list (edit) or the
  // flow it's being added to (create), like editingTask/creatingParent above.
  const checkpointEditor = dialogs.checkpointEditor;
  const editingCheckpoint =
    checkpointEditor?.mode === "edit"
      ? (checkpoints.find((c) => c.id === checkpointEditor.checkpointId) ?? null)
      : null;
  const checkpointTaskId =
    checkpointEditor?.mode === "create"
      ? checkpointEditor.taskId
      : (editingCheckpoint?.taskId ?? null);
  const checkpointFlow = checkpointTaskId
    ? (tasks.find((t) => t.id === checkpointTaskId) ?? null)
    : null;

  // The parent a create-as-subtask was launched from (Flows "Add subtask").
  // Resolved from the live task set so the dialog can inherit its collection,
  // privacy, and context, and file the new row under it.
  const creatingParent =
    editorState?.mode === "create" && editorState.parentId
      ? (tasks.find((t) => t.id === editorState.parentId) ?? null)
      : null;

  function syncUrl(v: TasksView, collectionId: string | null) {
    const params = new URLSearchParams();
    params.set("view", v);
    if (collectionId) params.set("collection", collectionId);
    router.replace(`/tasks?${params.toString()}`, { scroll: false });
  }

  function changeView(v: TasksView) {
    setView(v);
    syncUrl(v, activeCollection?.id ?? null);
  }

  function changeCollection(collectionId: string) {
    setActiveCollectionId(collectionId);
    syncUrl(view, collectionId);
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
    // SurfaceChrome (the (surfaces) layout) owns the h-dvh frame + header; the
    // shell fills the content area below it.
    <div className="flex h-full flex-col">
      <TasksToolbar
        view={view}
        onViewChange={changeView}
        onNewTask={() => dialogs.openCreate()}
        currentMember={workspace.data?.currentMember ?? null}
        activeCollectionId={activeCollection?.id ?? null}
        onCollectionChange={changeCollection}
        taskCountByCollection={taskCountByCollection}
      />

      <main className="min-h-0 flex-1 overflow-hidden">
        {!mounted ? (
          <div className="h-full" />
        ) : error ? (
          <LoadError
            subject="tasks"
            onRetry={() => void qc.invalidateQueries()}
          />
        ) : loading ? (
          <Centered>
            <Spinner className="size-5" />
          </Centered>
        ) : !activeCollection ? (
          <Centered>{t("collection.noCollectionsYet")}</Centered>
        ) : (
          // The collection control now lives in the app header (the toolbar
          // center slot), so the body is just the crossfaded board/list/flows.
          <div className="h-full overflow-hidden">
            {/* Crossfade the board/list swap instead of an instant cut.
                `initial={false}` paints the first view at once; only the
                manual switch animates. The swap is a deliberate user action,
                so the brief mode="wait" exit→enter never interrupts work. */}
            <AnimatePresence mode="wait" initial={false}>
              <m.div
                key={view}
                variants={fade}
                initial="initial"
                animate="animate"
                exit="exit"
                className="h-full"
              >
                {view === "flows" && !isMobile ? (
                  <TaskFlows
                    tasks={topLevel}
                    childrenByParent={childrenByParent}
                    eventsByTask={eventsByTask}
                    blocksByTask={blocksByTask}
                    checkpointsByTask={checkpointsByTask}
                    colorOf={colorOf}
                    lineStyleOf={lineStyleOf}
                    members={memberMap}
                    currentMemberId={workspace.data?.currentMember?.id ?? null}
                    actions={actions}
                    boards={activeBoards}
                    categories={categories}
                    display={flowsDisplay}
                    onDisplayChange={setFlowsDisplay}
                    onResetDisplay={resetFlowsDisplay}
                    expandLane={expandLane}
                    loading={eventsLoading || blocksLoading}
                  />
                ) : view === "board" ? (
                  <TaskBoard
                    tasks={topLevel}
                    boards={activeBoards}
                    collectionId={activeCollection?.id ?? ""}
                    workspaceId={workspace.data?.workspaceId ?? ""}
                    colorOf={colorOf}
                    members={memberMap}
                    progressOf={progressFor}
                    actions={actions}
                  />
                ) : (
                  <TaskList
                    tasks={topLevel}
                    boards={activeBoards}
                    colorOf={colorOf}
                    members={memberMap}
                    progressOf={progressFor}
                    actions={actions}
                  />
                )}
              </m.div>
            </AnimatePresence>
          </div>
        )}
      </main>

      {dialogs.editor &&
        workspace.data?.currentMember &&
        (dialogs.editor.mode === "create" || editingTask) && (
          <TaskDialog
            open
            onOpenChange={(o) => {
              if (!o) dialogs.closeEditor();
            }}
            mode={dialogs.editor.mode}
            workspaceId={workspace.data.workspaceId}
            currentMemberId={workspace.data.currentMember.id}
            collectionId={activeCollection?.id ?? null}
            boards={activeBoards}
            members={members}
            categories={categories}
            task={editingTask}
            subtasks={editingSubtasks}
            createParent={
              dialogs.editor.mode === "create" ? creatingParent : null
            }
            onCreated={
              creatingParent
                ? () =>
                    setExpandLane((prev) => ({
                      id: creatingParent.id,
                      key: (prev?.key ?? 0) + 1,
                    }))
                : undefined
            }
            defaultBoardId={
              dialogs.editor.mode === "create"
                ? dialogs.editor.boardId
                : undefined
            }
            onSchedule={
              editingTask
                ? () => dialogs.scheduleFromEditor(editingTask)
                : undefined
            }
          />
        )}

      {checkpointEditor &&
        workspace.data?.currentMember &&
        checkpointFlow &&
        (checkpointEditor.mode === "create" || editingCheckpoint) && (
          <CheckpointDialog
            open
            onOpenChange={(o) => {
              if (!o) dialogs.closeCheckpoint();
            }}
            mode={checkpointEditor.mode}
            workspaceId={workspace.data.workspaceId}
            currentMemberId={workspace.data.currentMember.id}
            taskId={checkpointFlow.id}
            taskTitle={checkpointFlow.title}
            defaultAtDate={
              checkpointEditor.mode === "create" ? checkpointEditor.atDate : undefined
            }
            checkpoint={editingCheckpoint}
          />
        )}

      {dialogs.scheduling && workspace.data && (
        <ScheduleTaskDialog
          open
          onOpenChange={(o) => !o && dialogs.closeSchedule()}
          task={dialogs.scheduling}
          subtasks={childrenByParent.get(dialogs.scheduling.id) ?? []}
          workspaceId={workspace.data.workspaceId}
          // A due date is a zone-free token; seed the dialog at 09:00 of that
          // day in the viewer's zone.
          defaultStartMs={
            dialogs.scheduling.dueDate
              ? combineDateTime(dialogs.scheduling.dueDate, "09:00", timeZone)
              : undefined
          }
        />
      )}

      <AlertDialog
        open={dialogs.deleting !== null}
        onOpenChange={(o) => !o && dialogs.closeDelete()}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("taskDialog.deleteTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("taskDialog.deleteDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tc("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (dialogs.deleting)
                  void mutations.remove(dialogs.deleting.id);
                dialogs.closeDelete();
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {tc("delete")}
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
