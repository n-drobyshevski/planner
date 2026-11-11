"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import { useSearchParams } from "next/navigation";

import { TaskFlows } from "@/components/tasks/task-flows";
import { TaskDialog } from "@/components/tasks/task-dialog";
import type { SavedStreamsApi } from "@/components/tasks/flows/flows-display-menu";
import { SlotTarget, ToolbarSlotsProvider } from "@/components/toolbar-slots";
import { Button } from "@/components/ui/button";
import { msToDateInput, localTimeZone } from "@/lib/datetime/local";
import {
  DEFAULT_FLOWS_DISPLAY,
  coerceFlowsDisplay,
  type FlowsDisplay,
} from "@/lib/tasks/flows-display";
import { groupByParent, indexById } from "@/lib/tasks/tree";
import { dependencyBlockedIds } from "@/lib/tasks/blocking";
import { collectTags } from "@/lib/tasks/tags";
import type { TaskActions } from "@/components/tasks/task-actions";
import type {
  Board,
  Category,
  Collection,
  EventRow,
  Member,
  TaskCheckpoint,
  TaskRow,
  TaskStatusEvent,
  TaskStream,
} from "@/lib/types";

const WS = "preview";
const ME = "m1";
const DAY = 86_400_000;

// Only id / name / color are read by the views (see /preview/dialogs).
const members = [
  { id: "m1", name: "Alex", color: "#c0492a" },
  { id: "m2", name: "Sam", color: "#0f766e" },
] as unknown as Member[];

const categories: Category[] = [
  { id: "c1", workspaceId: WS, ownerId: null, name: "Household", color: "#b45309", sortOrder: 0 },
  { id: "c2", workspaceId: WS, ownerId: ME, name: "Work", color: "#0369a1", sortOrder: 1 },
];

const collections: Collection[] = [
  { id: "col1", workspaceId: WS, ownerId: null, name: "Home", color: "#b45309", sortOrder: 0 },
  { id: "col2", workspaceId: WS, ownerId: ME, name: "Study", color: "#7c3aed", sortOrder: 1 },
];

function boardsFor(collectionId: string): Board[] {
  return [
    { name: "To Do", lineStyle: "dotted", isDone: false },
    { name: "In Progress", lineStyle: "solid", isDone: false },
    { name: "Done", lineStyle: "solid", isDone: true },
  ].map(
    (b, i) =>
      ({
        id: `${collectionId}-b${i}`,
        workspaceId: WS,
        collectionId,
        position: i,
        ...b,
      }) as Board,
  );
}
const allBoards = [...boardsFor("col1"), ...boardsFor("col2")];

interface Seed {
  id: string;
  title: string;
  col: string;
  /** board index 0..2 */
  state: 0 | 1 | 2;
  createdDaysAgo: number;
  dueIn?: number;
  priority?: number;
  tags?: string[];
  assignee?: string;
  owner?: string;
  parent?: string;
  doneDaysAgo?: number;
  /** a planned start this many days from today (a future start = "planned") */
  startIn?: number;
}

// "dueIn" is relative to the viewer's today, so the attention markers read the
// same whenever the preview is opened.
const SEEDS: Seed[] = [
  { id: "t1", title: "Draft the literature review", col: "col2", state: 1, createdDaysAgo: 20, dueIn: 1, priority: 2, tags: ["thesis"], assignee: "m1" },
  { id: "t2", title: "Book the defence room", col: "col2", state: 0, createdDaysAgo: 9, dueIn: -2, priority: 1, tags: ["thesis", "admin"], assignee: "m1" },
  { id: "t3", title: "Submit the ethics form", col: "col2", state: 0, createdDaysAgo: 5, dueIn: 6, tags: ["admin"], assignee: "m1" },
  { id: "t4", title: "Collect interview transcripts", col: "col2", state: 2, createdDaysAgo: 30, doneDaysAgo: 6, tags: ["thesis"], assignee: "m1" },
  { id: "t5", title: "Fix the leaking tap", col: "col1", state: 0, createdDaysAgo: 3, dueIn: 3, priority: 3, tags: ["home"], assignee: "m2", owner: "m2" },
  { id: "t6", title: "Plan the weekly shop", col: "col1", state: 1, createdDaysAgo: 12, dueIn: 9, tags: ["home"], assignee: "m1" },
  { id: "t7", title: "Renew the car insurance", col: "col1", state: 0, createdDaysAgo: 15, dueIn: 4, priority: 2, tags: ["admin"], assignee: "m2", owner: "m2" },
  { id: "t8", title: "Sort the winter clothes", col: "col1", state: 0, createdDaysAgo: 2 },
  { id: "t9", title: "Physio exercises", col: "col1", state: 1, createdDaysAgo: 25, dueIn: 12, priority: 1, tags: ["health"], assignee: "m1" },
  { id: "t11", title: "File the grant report", col: "col2", state: 1, createdDaysAgo: 14, dueIn: -3, priority: 2, tags: ["admin"], assignee: "m1" },
  { id: "t10", title: "Write the methods chapter", col: "col2", state: 0, createdDaysAgo: 1, startIn: 4, dueIn: 16, priority: 1, tags: ["thesis"], assignee: "m1" },
  { id: "s1", title: "Outline chapter two", col: "col2", state: 2, createdDaysAgo: 18, doneDaysAgo: 4, parent: "t1" },
  { id: "s2", title: "Annotate key papers", col: "col2", state: 1, createdDaysAgo: 16, dueIn: 2, parent: "t1" },
  { id: "s3", title: "Pick the search terms", col: "col2", state: 2, createdDaysAgo: 19, doneDaysAgo: 12, parent: "t1" },
  { id: "s4", title: "Summarise each strand", col: "col2", state: 0, createdDaysAgo: 10, dueIn: 1, parent: "t1" },
  { id: "s5", title: "Write the gap statement", col: "col2", state: 0, createdDaysAgo: 8, parent: "t1" },
];

/** Waits-for links: the methods chapter waits for the review, the ethics form for the room, the gap statement for the summary. */
const DEPS = [
  { taskId: "t10", dependsOnTaskId: "t1" },
  { taskId: "t3", dependsOnTaskId: "t2" },
  { taskId: "s5", dependsOnTaskId: "s4" },
  { taskId: "t10", dependsOnTaskId: "s5" },
];

function buildFixtures(today: string, nowMs: number) {
  const todayMs = Date.parse(`${today}T00:00:00Z`);
  const tasks: TaskRow[] = [];
  const events: TaskStatusEvent[] = [];
  for (const s of SEEDS) {
    const created = nowMs - s.createdDaysAgo * DAY;
    const board = `${s.col}-b${s.state}`;
    const completedAt = s.state === 2 ? nowMs - (s.doneDaysAgo ?? 1) * DAY : null;
    tasks.push({
      id: s.id,
      workspaceId: WS,
      ownerId: s.owner ?? ME,
      assigneeId: s.assignee ?? null,
      parentId: s.parent ?? null,
      collectionId: s.col,
      categoryId: s.col === "col2" ? "c2" : "c1",
      title: s.title,
      description: null,
      isPrivate: false,
      color: null,
      boardId: board,
      priority: s.priority ?? null,
      dueDate: s.dueIn === undefined ? null : msToDateInput(todayMs + s.dueIn * DAY, "UTC"),
      startDate: s.startIn === undefined ? null : msToDateInput(todayMs + s.startIn * DAY, "UTC"),
      isMilestone: false,
      position: 0,
      sequential: false,
      completedAt,
      attributes: {},
      tags: s.tags ?? [],
      createdAt: created,
      updatedAt: created,
      updatedBy: null,
    });
    events.push({
      id: `${s.id}-e0`,
      taskId: s.id,
      workspaceId: WS,
      fromBoardId: null,
      toBoardId: `${s.col}-b0`,
      toIsDone: false,
      changedBy: ME,
      changedAt: created,
    });
    if (s.state >= 1) {
      events.push({
        id: `${s.id}-e1`,
        taskId: s.id,
        workspaceId: WS,
        fromBoardId: `${s.col}-b0`,
        toBoardId: `${s.col}-b1`,
        toIsDone: false,
        changedBy: ME,
        changedAt: created + Math.max(1, s.createdDaysAgo / 3) * DAY,
      });
    }
    if (completedAt) {
      events.push({
        id: `${s.id}-e2`,
        taskId: s.id,
        workspaceId: WS,
        fromBoardId: `${s.col}-b1`,
        toBoardId: `${s.col}-b2`,
        toIsDone: true,
        changedBy: ME,
        changedAt: completedAt,
      });
    }
  }
  return { tasks, events };
}

const noop = () => {};

const subscribeNoop = () => () => {};

/**
 * Client-only, like the real shell's `dynamic(..., { ssr: false })` Flows: the
 * fixture is built from the clock, so a server render could never match.
 */
export function FlowsPreview() {
  const mounted = useSyncExternalStore(subscribeNoop, () => true, () => false);
  return mounted ? <FlowsPreviewInner /> : null;
}

function FlowsPreviewInner() {
  const params = useSearchParams();
  const [nowMs] = useState(() => Date.now());
  const today = msToDateInput(nowMs, localTimeZone());
  const fixtures = useMemo(() => buildFixtures(today, nowMs), [today, nowMs]);
  const [tasks, setTasks] = useState<TaskRow[]>(fixtures.tasks);

  const [display, setDisplay] = useState<FlowsDisplay>(() =>
    coerceFlowsDisplay({
      ...DEFAULT_FLOWS_DISPLAY,
      mode: params.get("mode") ?? "tasks",
      groupBy: params.get("group") ?? "none",
      sortBy: params.get("sort") ?? "manual",
      sortDir: params.get("dir") ?? (params.get("sort") === "attention" ? "desc" : "asc"),
      attention: params.get("attention") ?? "combined",
      scope: params.get("scope") ?? "all",
      laneStyle: params.get("lanes") ?? "runway",
    }),
  );
  const [streams, setStreams] = useState<TaskStream[]>(() => [
    {
      id: "st1",
      workspaceId: WS,
      memberId: ME,
      name: "Thesis by tag",
      definition: { ...DEFAULT_FLOWS_DISPLAY, groupBy: "tag", mode: "streams", scope: "all" },
      position: 0,
      createdAt: nowMs,
      updatedAt: nowMs,
    },
  ]);
  const [dialogOpen, setDialogOpen] = useState(params.get("dialog") === "task");

  const scoped = useMemo(
    () => (display.scope === "all" ? tasks : tasks.filter((t) => t.collectionId === "col2")),
    [tasks, display.scope],
  );
  const childrenByParent = useMemo(() => groupByParent(scoped), [scoped]);
  const treeById = useMemo(() => indexById(scoped), [scoped]);
  const eventsByTask = useMemo(() => {
    const m = new Map<string, TaskStatusEvent[]>();
    for (const e of fixtures.events) m.set(e.taskId, [...(m.get(e.taskId) ?? []), e]);
    return m;
  }, [fixtures.events]);
  const memberMap = useMemo(() => new Map(members.map((m) => [m.id, m])), []);
  const dependencyBlocked = useMemo(
    () => dependencyBlockedIds(DEPS, (id) => tasks.find((t) => t.id === id)?.completedAt != null),
    [tasks],
  );
  const boards = useMemo(
    () =>
      display.scope === "all"
        ? allBoards.map((b) => ({
            ...b,
            name: `${b.name} · ${collections.find((c) => c.id === b.collectionId)?.name}`,
          }))
        : allBoards.filter((b) => b.collectionId === "col2"),
    [display.scope],
  );
  const lineStyleOf = (t: TaskRow) => allBoards.find((b) => b.id === t.boardId)?.lineStyle ?? "solid";
  const colorOf = (t: TaskRow) => memberMap.get(t.ownerId)?.color ?? "#57534e";

  const actions: TaskActions = {
    open: noop,
    toggleDone: noop,
    move: noop,
    reorderFlow: (t, flowPos) =>
      setTasks((prev) =>
        prev.map((x) => (x.id === t.id ? { ...x, attributes: { ...x.attributes, flowPos } } : x)),
      ),
    create: noop,
    addSubtask: noop,
    reparent: noop,
    promote: noop,
    changeColor: noop,
    remove: noop,
    addCheckpoint: noop,
    openCheckpoint: noop,
  };

  const savedStreams: SavedStreamsApi = {
    streams,
    onSave: async (name, definition) => {
      if (streams.some((s) => s.name.toLowerCase() === name.toLowerCase()))
        throw new Error("You already have a stream with that name.");
      setStreams((prev) => [
        ...prev,
        { id: `st${prev.length + 1}`, workspaceId: WS, memberId: ME, name, definition, position: prev.length, createdAt: nowMs, updatedAt: nowMs },
      ]);
    },
    onRename: async (id, name) =>
      setStreams((prev) => prev.map((s) => (s.id === id ? { ...s, name } : s))),
    onDelete: async (id) => setStreams((prev) => prev.filter((s) => s.id !== id)),
  };


  return (
    <ToolbarSlotsProvider>
      <div className="flex h-dvh flex-col bg-background">
        <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-4">
          <h1 className="text-sm font-medium">Flows preview</h1>
          <span className="text-xs text-muted-foreground">fixture data, nothing is saved</span>
          <div className="ml-auto flex items-center gap-1">
            <Button variant="outline" size="sm" onClick={() => setDialogOpen(true)}>
              Open task dialog
            </Button>
            <SlotTarget name="trailing" />
          </div>
        </header>
        <main className="min-h-0 flex-1">
          <TaskFlows
            tasks={childrenByParent.get(null) ?? []}
            childrenByParent={childrenByParent}
            treeById={treeById}
            eventsByTask={eventsByTask}
            blocksByTask={new Map<string, EventRow[]>()}
            checkpointsByTask={new Map<string, TaskCheckpoint[]>()}
            colorOf={colorOf}
            lineStyleOf={lineStyleOf}
            members={memberMap}
            currentMemberId={ME}
            actions={actions}
            boards={boards}
            collections={collections}
            categories={categories}
            display={display}
            onDisplayChange={setDisplay}
            onResetDisplay={() => setDisplay(DEFAULT_FLOWS_DISPLAY)}
            savedStreams={savedStreams}
            initialExpandedStreams={params.getAll("expand")}
            dependencies={DEPS}
            blockedIds={dependencyBlocked}
          />
        </main>
      </div>
      {/* Create mode: the edit dialog's subtask/dependency editors need a live
          Supabase client, which this sandbox doesn't have. */}
      {dialogOpen && (
        <TaskDialog
          open
          onOpenChange={(o) => !o && setDialogOpen(false)}
          mode="create"
          workspaceId={WS}
          currentMemberId={ME}
          collectionId="col2"
          boards={allBoards.filter((b) => b.collectionId === "col2")}
          members={members}
          categories={categories}
          tagSuggestions={collectTags(tasks)}
        />
      )}
    </ToolbarSlotsProvider>
  );
}
