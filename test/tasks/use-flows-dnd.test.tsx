import { describe, it, expect, vi } from "vitest";
import type { DragEndEvent } from "@dnd-kit/core";
import { renderHook, act } from "../test-utils";
import { useFlowsDnd, type FlowsDndItem } from "@/lib/hooks/use-flows-dnd";
import { NEST_PREFIX } from "@/lib/tasks/nest-collision";
import type { FlowLane } from "@/lib/tasks/flows-layout";
import type { TaskRow } from "@/lib/types";

const T0 = Date.UTC(2026, 5, 1);

function task(id: string, over: Partial<TaskRow> = {}): TaskRow {
  return {
    id,
    workspaceId: "w",
    ownerId: "me",
    assigneeId: null,
    parentId: null,
    collectionId: "c1",
    categoryId: null,
    title: id,
    description: null,
    isPrivate: false,
    color: null,
    boardId: null,
    priority: null,
    dueDate: null,
    startDate: null,
    isMilestone: false,
    position: 0,
    sequential: false,
    completedAt: null,
    attributes: {},
    tags: [],
    createdAt: T0,
    updatedAt: T0,
    updatedBy: null,
    ...over,
  };
}

const lane = (t: TaskRow): FlowLane => ({
  task: t,
  startMs: T0,
  endMs: null,
  nodes: [],
  milestone: false,
  checkpoints: [],
  branches: [],
  done: false,
});

// a, b, c tagged "x"; b also tagged "y" with d. b appears in both groups.
const a = task("a", { tags: ["x"] });
const b = task("b", { tags: ["x", "y"] });
const c = task("c", { tags: ["x"] });
const d = task("d", { tags: ["y"], collectionId: "c2" });
const items: FlowsDndItem[] = [
  { key: "tag:x:a", lane: lane(a), group: "tag:x" },
  { key: "tag:x:b", lane: lane(b), group: "tag:x" },
  { key: "tag:x:c", lane: lane(c), group: "tag:x" },
  { key: "tag:y:b", lane: lane(b), group: "tag:y" },
  { key: "tag:y:d", lane: lane(d), group: "tag:y" },
];
const anchors: Record<string, number> = { a: 0, b: 1, c: 2, d: 3 };
const treeById = new Map([a, b, c, d].map((t) => [t.id, t]));
const treeByParent = new Map<string | null, TaskRow[]>([[null, [a, b, c, d]]]);

function setup(canReorder = true) {
  const onReorder = vi.fn();
  const onReparent = vi.fn();
  const { result } = renderHook(() =>
    useFlowsDnd(items, {
      anchorOf: (id) => anchors[id],
      onReorder,
      onReparent,
      treeById,
      treeByParent,
      canReorder,
    }),
  );
  const drop = (active: string, over: string) =>
    act(() =>
      result.current.onDragEnd({
        active: { id: active },
        over: { id: over },
      } as unknown as DragEndEvent),
    );
  return { result, onReorder, onReparent, drop };
}

describe("useFlowsDnd (row-keyed)", () => {
  it("uses row keys as sortable ids, so a two-tag task has two", () => {
    const { result } = setup();
    expect(result.current.ids).toEqual(items.map((i) => i.key));
  });

  it("reorders within the group and writes the task's global rank", () => {
    const { onReorder, drop } = setup();
    drop("tag:x:a", "tag:x:c"); // a moves to the end of group x
    expect(onReorder).toHaveBeenCalledTimes(1);
    expect(onReorder.mock.calls[0][0].id).toBe("a");
    expect(onReorder.mock.calls[0][1]).toBeGreaterThan(anchors.c);
  });

  it("ignores a drop onto another group's row", () => {
    const { onReorder, drop } = setup();
    drop("tag:x:a", "tag:y:d");
    expect(onReorder).not.toHaveBeenCalled();
  });

  it("does not reorder outside manual sort", () => {
    const { onReorder, drop } = setup(false);
    drop("tag:x:a", "tag:x:c");
    expect(onReorder).not.toHaveBeenCalled();
  });

  it("nests onto the task behind the target row", () => {
    const { onReparent, drop } = setup(false);
    drop("tag:x:a", `${NEST_PREFIX}tag:y:b`);
    expect(onReparent).toHaveBeenCalledWith(a, "b");
  });

  it("refuses to nest a task onto its own copy in another group", () => {
    const { onReparent, drop } = setup();
    drop("tag:x:b", `${NEST_PREFIX}tag:y:b`);
    expect(onReparent).not.toHaveBeenCalled();
  });

  it("refuses to nest across collections", () => {
    const { onReparent, drop } = setup();
    drop("tag:x:a", `${NEST_PREFIX}tag:y:d`);
    expect(onReparent).not.toHaveBeenCalled();
  });

  it("reports the dragged row's lane while a drag is active", () => {
    const { result } = setup();
    act(() => result.current.onDragStart({ active: { id: "tag:y:b" } } as never));
    expect(result.current.activeLane?.task.id).toBe("b");
  });
});
