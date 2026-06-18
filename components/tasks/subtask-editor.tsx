"use client";

// Recursive subtask tree for the task dialog. Renders the editing task's whole
// subtree (N levels, capped at MAX_DEPTH) as an indented tree with expand/
// collapse, per-subtask inline detail disclosure, and per-row actions. Depth is
// conveyed by indentation + hairline connector rails + aria-level — never color.
// One DndContext over a flattened, position-ordered id list: an edge-drop
// reorders within a sibling group, a centre-drop re-parents (cycle/max-depth
// guarded by canNest). Drag bookkeeping reads the whole-collection maps so a
// dragged subtree's depth is measured absolutely.
import { useMemo, useState } from "react";
import { useForm } from "@tanstack/react-form";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  CalendarPlus,
  ChevronRight,
  GripVertical,
  Indent,
  Lock,
  MoreHorizontal,
  Outdent,
  Plus,
  SlidersHorizontal,
  Trash2,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SubtaskDetail } from "./subtask-detail";
import { useTaskMutations } from "@/lib/hooks/use-task-mutations";
import {
  MAX_DEPTH,
  depthOf,
  flattenTree,
  groupByParent,
  progressDeep,
  type ById,
  type FlatNode,
} from "@/lib/tasks/tree";
import { blockedIds } from "@/lib/tasks/blocking";
import { canNest } from "@/lib/tasks/nesting";
import { NEST_PREFIX, nestCollision, nestTargetId } from "@/lib/tasks/nest-collision";
import { positionBetween } from "@/lib/tasks/ordering";
import { cn } from "@/lib/utils";
import type { TaskInput } from "@/lib/supabase/mappers";
import type { Category, Member, TaskDependency, TaskRow } from "@/lib/types";

const INDENT = 20; // px per nesting level

export function SubtaskEditor({
  parent,
  subtasks,
  workspaceId,
  members,
  categories,
  currentMemberId,
  treeById,
  treeByParent,
  dependencies,
  dependencyBlocked,
  dependencyCandidates,
  onSchedule,
  onOpenTask,
}: {
  parent: TaskRow;
  /** Every descendant of `parent` (the whole subtree, not just direct children). */
  subtasks: TaskRow[];
  workspaceId: string;
  members: Member[];
  categories: Category[];
  currentMemberId: string;
  /** Whole-collection maps for absolute cycle/max-depth checks while dragging. */
  treeById: ById;
  treeByParent: Map<string | null, TaskRow[]>;
  /** All dependency edges (workspace), for the per-subtask Blocked-by editors. */
  dependencies: TaskDependency[];
  /** Task ids blocked by an unmet dependency (combined with sequential blocking). */
  dependencyBlocked: ReadonlySet<string>;
  /** Candidate tasks to depend on (the collection's tasks). */
  dependencyCandidates: TaskRow[];
  /** Open the calendar scheduling dialog for a single subtask. */
  onSchedule?: (task: TaskRow) => void;
  /** Open the full task editor for a subtask (the inline-panel escape hatch). */
  onOpenTask?: (task: TaskRow) => void;
}) {
  const t = useTranslations("tasks");
  const tc = useTranslations("common");
  const mutations = useTaskMutations(workspaceId);

  // The subtree, grouped by parent (direct children of `parent` sit under its id).
  const byParent = useMemo(() => groupByParent(subtasks), [subtasks]);

  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set());
  const [detailOpen, setDetailOpen] = useState<ReadonlySet<string>>(() => new Set());
  const [activeId, setActiveId] = useState<string | null>(null);
  const [nestTarget, setNestTarget] = useState<string | null>(null);
  const [addingUnder, setAddingUnder] = useState<string | null>(null);

  const visible = useMemo(
    () => flattenTree(parent.id, byParent, expanded),
    [parent.id, byParent, expanded],
  );
  const visibleIds = useMemo(() => visible.map((n) => n.task.id), [visible]);

  // Sequential blocking applies per-parent at any depth: for each sequential
  // parent in the subtree, its not-done children after the first are blocked.
  const blocked = useMemo(() => {
    const set = new Set<string>();
    for (const [pid, kids] of byParent) {
      const seqParent = pid === parent.id ? parent : treeById.get(pid as string);
      if (seqParent?.sequential) for (const id of blockedIds(kids, true)) set.add(id);
    }
    return set;
  }, [byParent, parent, treeById]);

  const { done, total } = progressDeep(parent.id, byParent);

  const toggleExpand = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const toggleDetail = (id: string) =>
    setDetailOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const expand = (id: string) => setExpanded((prev) => new Set(prev).add(id));

  // Add-subtask form (header / root). Body is a declaration invoked at submit so
  // the React Compiler doesn't treat its Date.now() as render-scoped.
  const addForm = useForm({
    defaultValues: { title: "" },
    onSubmit: ({ value }) => addSubtask(parent, value.title, () => addForm.reset()),
  });

  function addSubtask(under: TaskRow, rawTitle: string, after?: () => void) {
    const title = rawTitle.trim();
    if (!title) return;
    const input: TaskInput = {
      workspaceId,
      ownerId: under.ownerId,
      parentId: under.id,
      collectionId: under.collectionId,
      assigneeId: under.assigneeId,
      categoryId: under.categoryId,
      title,
      isPrivate: under.isPrivate,
      boardId: under.boardId,
      position: Date.now(),
    };
    after?.();
    if (under.id !== parent.id) expand(under.id);
    void mutations.create(input);
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const canNestInto = (childId: string, parentId: string) => {
    const child = treeById.get(childId);
    const into = treeById.get(parentId);
    return !!child && !!into && canNest(child, into, treeById, treeByParent);
  };
  const collision = useMemo(() => nestCollision(canNestInto, closestCenter), [treeById, treeByParent]); // eslint-disable-line react-hooks/exhaustive-deps

  function onDragEnd(e: DragEndEvent) {
    setActiveId(null);
    setNestTarget(null);
    const { active, over } = e;
    if (!over) return;
    const childId = String(active.id);
    const child = treeById.get(childId);
    if (!child) return;

    // Centre-drop → re-parent under the hovered row (append after its children).
    const nestId = nestTargetId(String(over.id));
    if (nestId) {
      if (!canNestInto(childId, nestId)) return;
      const last = (treeByParent.get(nestId) ?? []).at(-1);
      void mutations.reparent(child, nestId, positionBetween(last?.position ?? null, null));
      expand(nestId);
      return;
    }

    // Edge-drop → reorder, but only within the same sibling group.
    const overId = String(over.id);
    if (childId === overId) return;
    const over_ = treeById.get(overId);
    if (!over_ || over_.parentId !== child.parentId) return;
    const sibs = (treeByParent.get(child.parentId) ?? []).map((s) => s.id);
    const from = sibs.indexOf(childId);
    const to = sibs.indexOf(overId);
    if (from < 0 || to < 0) return;
    const next = arrayMove(sibs, from, to);
    const pos = next.indexOf(childId);
    const before = pos > 0 ? treeById.get(next[pos - 1])?.position ?? null : null;
    const after = pos < next.length - 1 ? treeById.get(next[pos + 1])?.position ?? null : null;
    void mutations.update(childId, { position: positionBetween(before, after) });
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border bg-muted/30 p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm font-medium">
          {t("subtasks.title")}
          {total > 0 && (
            <span className="text-xs text-muted-foreground tabular-nums">
              {done}/{total}
            </span>
          )}
        </div>
        {total > 0 && (
          <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
            <span>{t("subtasks.doInOrder")}</span>
            <Switch
              checked={parent.sequential}
              onCheckedChange={(v) => void mutations.update(parent.id, { sequential: v })}
              aria-label={t("subtasks.completeInOrder")}
            />
          </label>
        )}
      </div>

      {total > 0 && (
        <Progress
          value={(done / total) * 100}
          aria-label={t("subtasks.progressLabel", { done, total })}
          className="h-1.5 *:data-[slot=progress-indicator]:duration-300 *:data-[slot=progress-indicator]:motion-reduce:transition-none"
        />
      )}

      {parent.sequential && total > 0 && (
        <p className="text-xs text-muted-foreground">{t("subtasks.sequentialHint")}</p>
      )}

      <DndContext
        sensors={sensors}
        collisionDetection={collision}
        onDragStart={(e) => setActiveId(String(e.active.id))}
        onDragOver={(e: DragOverEvent) =>
          setNestTarget(nestTargetId(e.over ? String(e.over.id) : null))
        }
        onDragEnd={onDragEnd}
        onDragCancel={() => {
          setActiveId(null);
          setNestTarget(null);
        }}
      >
        <SortableContext items={visibleIds} strategy={verticalListSortingStrategy}>
          <ul role="tree" aria-label={t("subtasks.title")} className="flex flex-col gap-1">
            {visible.map((node) => (
              <SubtaskRow
                key={node.task.id}
                node={node}
                expanded={expanded.has(node.task.id)}
                detailOpen={detailOpen.has(node.task.id)}
                blocked={blocked.has(node.task.id) || dependencyBlocked.has(node.task.id)}
                nesting={nestTarget === node.task.id}
                dragging={activeId === node.task.id}
                canAddChild={depthOf(node.task, treeById) < MAX_DEPTH}
                canDemote={depthOf(node.task, treeById) < MAX_DEPTH}
                addingChild={addingUnder === node.task.id}
                onToggleExpand={() => toggleExpand(node.task.id)}
                onToggleDetail={() => toggleDetail(node.task.id)}
                onToggleDone={() => void mutations.toggleDone(node.task)}
                onRename={(title) => {
                  if (title && title !== node.task.title)
                    void mutations.update(node.task.id, { title });
                }}
                onPromoteOneLevel={() => void mutations.promoteOneLevel(node.task)}
                onPromoteToTop={() => void mutations.promote(node.task)}
                onDemote={() => void mutations.demote(node.task)}
                onDelete={() => void mutations.remove(node.task.id)}
                onSchedule={onSchedule ? () => onSchedule(node.task) : undefined}
                onStartAddChild={() => {
                  expand(node.task.id);
                  setAddingUnder(node.task.id);
                }}
                onAddChild={(title) =>
                  addSubtask(node.task, title, () => setAddingUnder(null))
                }
                onCancelAddChild={() => setAddingUnder(null)}
                members={members}
                categories={categories}
                currentMemberId={currentMemberId}
                workspaceId={workspaceId}
                dependencies={dependencies}
                dependencyCandidates={dependencyCandidates}
                onOpenFull={onOpenTask ? () => onOpenTask(node.task) : undefined}
                t={t}
              />
            ))}
          </ul>
        </SortableContext>
      </DndContext>

      {total === 0 && (
        <p className="text-xs text-muted-foreground">{t("subtasks.emptyHint")}</p>
      )}

      <div className="flex items-center gap-2">
        <addForm.Field name="title">
          {(field) => (
            <Input
              value={field.state.value}
              onChange={(e) => field.handleChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void addForm.handleSubmit();
                }
              }}
              placeholder={t("subtasks.addPlaceholder")}
              className="h-8"
            />
          )}
        </addForm.Field>
        <addForm.Subscribe selector={(s) => s.values.title}>
          {(title) => (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void addForm.handleSubmit()}
              disabled={!title.trim()}
            >
              <Plus data-icon="inline-start" />
              {tc("add")}
            </Button>
          )}
        </addForm.Subscribe>
      </div>
    </div>
  );
}

type Translator = ReturnType<typeof useTranslations>;

function SubtaskRow({
  node,
  expanded,
  detailOpen,
  blocked,
  nesting,
  dragging,
  canAddChild,
  canDemote,
  addingChild,
  onToggleExpand,
  onToggleDetail,
  onToggleDone,
  onRename,
  onPromoteOneLevel,
  onPromoteToTop,
  onDemote,
  onDelete,
  onSchedule,
  onStartAddChild,
  onAddChild,
  onCancelAddChild,
  members,
  categories,
  currentMemberId,
  workspaceId,
  dependencies,
  dependencyCandidates,
  onOpenFull,
  t,
}: {
  node: FlatNode;
  expanded: boolean;
  detailOpen: boolean;
  blocked: boolean;
  nesting: boolean;
  dragging: boolean;
  canAddChild: boolean;
  canDemote: boolean;
  addingChild: boolean;
  onToggleExpand: () => void;
  onToggleDetail: () => void;
  onToggleDone: () => void;
  onRename: (title: string) => void;
  onPromoteOneLevel: () => void;
  onPromoteToTop: () => void;
  onDemote: () => void;
  onDelete: () => void;
  onSchedule?: () => void;
  onStartAddChild: () => void;
  onAddChild: (title: string) => void;
  onCancelAddChild: () => void;
  members: Member[];
  categories: Category[];
  currentMemberId: string;
  workspaceId: string;
  dependencies: TaskDependency[];
  dependencyCandidates: TaskRow[];
  onOpenFull?: () => void;
  t: Translator;
}) {
  const { task, depth, hasChildren } = node;
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
  } = useSortable({ id: task.id });
  // Second droppable over the row so a centre-band hover nests without the
  // sortable reorder reflow sliding the target away.
  const { setNodeRef: setNestRef } = useDroppable({ id: `${NEST_PREFIX}${task.id}` });
  const setRefs = (n: HTMLElement | null) => {
    setNodeRef(n);
    setNestRef(n);
  };
  const done = task.completedAt != null;
  const contentIndent = depth * INDENT + 28; // align panels under the title column

  return (
    <li
      role="treeitem"
      aria-level={depth + 1}
      aria-selected={false}
      aria-expanded={hasChildren ? expanded : undefined}
    >
      <div
        ref={setRefs}
        style={{ transform: CSS.Transform.toString(transform), transition }}
        className={cn(
          "group flex min-h-8 items-center gap-1 rounded-md bg-card pr-1",
          dragging && "opacity-50 shadow-soft",
          nesting && "ring-2 ring-primary",
        )}
      >
        {/* Ancestor connector rails — depth cue without color. */}
        {Array.from({ length: depth }).map((_, i) => (
          <span
            key={i}
            aria-hidden
            className="ml-2 h-8 w-3 shrink-0 self-stretch border-l border-border"
          />
        ))}

        {hasChildren ? (
          <button
            type="button"
            onClick={onToggleExpand}
            aria-label={expanded ? t("subtasks.collapse") : t("subtasks.expand")}
            className="grid size-6 shrink-0 place-items-center rounded text-muted-foreground hover:text-foreground"
          >
            <ChevronRight
              className={cn("size-4 transition-transform", expanded && "rotate-90")}
            />
          </button>
        ) : (
          <span className="w-6 shrink-0" aria-hidden />
        )}

        <button
          type="button"
          ref={setActivatorNodeRef}
          {...attributes}
          {...listeners}
          aria-label={t("subtasks.reorder")}
          className="grid size-6 shrink-0 cursor-grab touch-none place-items-center text-muted-foreground/40 hover:text-muted-foreground [@media(pointer:fine)]:opacity-0 [@media(pointer:fine)]:group-focus-within:opacity-100 [@media(pointer:fine)]:group-hover:opacity-100"
        >
          <GripVertical className="size-4" />
        </button>

        <Checkbox
          checked={done}
          disabled={blocked}
          onCheckedChange={onToggleDone}
          aria-label={done ? t("subtasks.markNotDone") : t("subtasks.markDone")}
        />

        <input
          defaultValue={task.title}
          key={task.title}
          onBlur={(e) => {
            const v = e.target.value.trim();
            if (v) onRename(v);
            else e.target.value = task.title;
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          }}
          className={cn(
            "min-w-0 flex-1 bg-transparent px-1 text-sm outline-none focus:rounded-sm focus:ring-2 focus:ring-ring",
            done && "text-muted-foreground line-through",
          )}
        />

        {blocked && (
          <Badge
            variant="outline"
            className="gap-1 text-muted-foreground"
            title={t("subtasks.blockedHint")}
          >
            <Lock /> {t("subtasks.blocked")}
          </Badge>
        )}

        {/* Action cluster: details + add-child shown on hover (fine pointers),
            always visible on touch; the overflow menu is always present. */}
        <div className="flex shrink-0 items-center">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-pressed={detailOpen}
            aria-label={detailOpen ? t("subtasks.hideDetails") : t("subtasks.details")}
            title={detailOpen ? t("subtasks.hideDetails") : t("subtasks.details")}
            onClick={onToggleDetail}
            className={cn(
              "size-7 text-muted-foreground hover:text-foreground [@media(pointer:fine)]:opacity-0 [@media(pointer:fine)]:group-focus-within:opacity-100 [@media(pointer:fine)]:group-hover:opacity-100",
              detailOpen && "text-foreground [@media(pointer:fine)]:opacity-100",
            )}
          >
            <SlidersHorizontal className="size-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            disabled={!canAddChild}
            aria-label={t("subtasks.addChild")}
            title={canAddChild ? t("subtasks.addChild") : t("subtasks.depthReached")}
            onClick={onStartAddChild}
            className="size-7 text-muted-foreground hover:text-foreground [@media(pointer:fine)]:opacity-0 [@media(pointer:fine)]:group-focus-within:opacity-100 [@media(pointer:fine)]:group-hover:opacity-100"
          >
            <Plus className="size-4" />
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={t("subtasks.actions")}
                className="size-7 text-muted-foreground hover:text-foreground"
              >
                <MoreHorizontal className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {onSchedule && (
                <DropdownMenuItem onSelect={onSchedule}>
                  <CalendarPlus />
                  {t("subtasks.schedule")}
                </DropdownMenuItem>
              )}
              {canDemote && (
                <DropdownMenuItem onSelect={onDemote}>
                  <Indent />
                  {t("subtasks.demote")}
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onSelect={onPromoteOneLevel}>
                <Outdent />
                {t("subtasks.promoteOneLevel")}
              </DropdownMenuItem>
              {task.parentId !== null && (
                <DropdownMenuItem onSelect={onPromoteToTop}>
                  <Outdent />
                  {t("subtasks.promoteToTop")}
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onSelect={onDelete}>
                <Trash2 />
                {t("subtasks.delete")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {detailOpen && (
        <div style={{ paddingLeft: contentIndent }} className="pt-1">
          <SubtaskDetail
            task={task}
            workspaceId={workspaceId}
            members={members}
            categories={categories}
            currentMemberId={currentMemberId}
            hasChildren={hasChildren}
            dependencies={dependencies}
            dependencyCandidates={dependencyCandidates}
            onOpenFull={onOpenFull ?? (() => {})}
          />
        </div>
      )}

      {addingChild && (
        <div style={{ paddingLeft: contentIndent }} className="pt-1">
          <AddChildRow
            placeholder={t("subtasks.addPlaceholder")}
            addLabel={t("subtasks.addChild")}
            onAdd={onAddChild}
            onCancel={onCancelAddChild}
          />
        </div>
      )}
    </li>
  );
}

function AddChildRow({
  placeholder,
  addLabel,
  onAdd,
  onCancel,
}: {
  placeholder: string;
  addLabel: string;
  onAdd: (title: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState("");
  const commit = () => {
    if (value.trim()) onAdd(value);
  };
  return (
    <div className="flex items-center gap-2">
      <Input
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit();
          } else if (e.key === "Escape") {
            onCancel();
          }
        }}
        onBlur={() => (value.trim() ? commit() : onCancel())}
        placeholder={placeholder}
        className="h-8"
      />
      <Button type="button" variant="outline" size="sm" onMouseDown={(e) => e.preventDefault()} onClick={commit} disabled={!value.trim()}>
        <Plus data-icon="inline-start" />
        {addLabel}
      </Button>
    </div>
  );
}
