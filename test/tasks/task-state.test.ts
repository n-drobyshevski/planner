import { describe, expect, it } from "vitest";

import {
  boardStates,
  phasesOf,
  stateOfBoard,
  stateSegments,
  taskState,
} from "@/lib/tasks/task-state";
import type { Board, TaskRow, TaskStatusEvent } from "@/lib/types";

const board = (id: string, collectionId: string, position: number, isDone = false): Board => ({
  id,
  workspaceId: "w",
  collectionId,
  name: id,
  lineStyle: "solid",
  position,
  isDone,
  createdAt: 0,
  updatedAt: 0,
});

// A collection with a backlog, two columns in between and a done column, out of order.
const BOARDS = [
  board("review", "c", 2),
  board("todo", "c", 0),
  board("done", "c", 3, true),
  board("doing", "c", 1),
  board("other-todo", "c2", 5),
  board("other-done", "c2", 6, true),
];

const DAY = 86_400_000;
const T0 = Date.UTC(2026, 10, 1, 9); // 1 Nov 2026, 09:00 UTC

function task(p: Partial<TaskRow> = {}): TaskRow {
  return {
    id: "t",
    workspaceId: "w",
    ownerId: "m",
    assigneeId: null,
    parentId: null,
    collectionId: "c",
    categoryId: null,
    title: "Task",
    description: null,
    isPrivate: false,
    color: null,
    boardId: "todo",
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
    ...p,
  };
}

let seq = 0;
function move(from: string | null, to: string | null, at: number, toIsDone = to === "done"): TaskStatusEvent {
  seq++;
  return { id: `e${seq}`, taskId: "t", workspaceId: "w", fromBoardId: from, toBoardId: to, toIsDone, changedBy: null, changedAt: at };
}

describe("stateOfBoard", () => {
  const ofC = BOARDS.filter((b) => b.collectionId === "c");
  it("reads a column's role from its place: first open = planned, done = done, the rest wip", () => {
    expect(stateOfBoard(ofC[1], ofC)).toBe("planned");
    expect(stateOfBoard(ofC[3], ofC)).toBe("wip");
    expect(stateOfBoard(ofC[0], ofC)).toBe("wip");
    expect(stateOfBoard(ofC[2], ofC)).toBe("done");
  });

  it("counts the column itself even when the list leaves it out, and breaks a position tie by id", () => {
    expect(stateOfBoard(board("x", "c", -1), ofC)).toBe("planned");
    const tie = [board("b", "k", 0), board("a", "k", 0)];
    expect(stateOfBoard(tie[1], tie)).toBe("planned");
    expect(stateOfBoard(tie[0], tie)).toBe("wip");
  });

  it("a collection of one open column has only planned", () => {
    const one = [board("only", "k", 0), board("fin", "k", 1, true)];
    expect(boardStates(one)).toEqual(
      new Map([
        ["only", "planned"],
        ["fin", "done"],
      ]),
    );
  });
});

describe("taskState", () => {
  const states = boardStates(BOARDS);
  it("is the column's role, else done when completed, planned when not", () => {
    expect(taskState(task({ boardId: "review" }), states)).toBe("wip");
    expect(taskState(task({ boardId: "other-todo" }), states)).toBe("planned");
    expect(taskState(task({ boardId: null }), states)).toBe("planned");
    expect(taskState(task({ boardId: null, completedAt: T0 }), states)).toBe("done");
    expect(taskState(task({ boardId: "gone", completedAt: T0 }), states)).toBe("done");
  });
});

describe("phasesOf", () => {
  it("is one phase in the state now when there is no history", () => {
    expect(phasesOf(task({ boardId: "doing" }), [], BOARDS)).toEqual([{ state: "wip", from: T0 }]);
    expect(phasesOf(task({ boardId: null }), undefined, BOARDS)).toEqual([{ state: "planned", from: T0 }]);
  });

  it("follows the moves from creation: planned, then in progress, then done", () => {
    const events = [
      move(null, "todo", T0),
      move("todo", "doing", T0 + 2 * DAY),
      move("doing", "review", T0 + 3 * DAY), // still in progress: one phase
      move("review", "done", T0 + 5 * DAY),
    ];
    expect(phasesOf(task({ boardId: "done", completedAt: T0 + 5 * DAY }), events, BOARDS)).toEqual([
      { state: "planned", from: T0 },
      { state: "wip", from: T0 + 2 * DAY },
      { state: "done", from: T0 + 5 * DAY },
    ]);
  });

  it("starts at the planned start in the state the task was in then", () => {
    const events = [move(null, "todo", T0), move("todo", "doing", T0 + DAY), move("doing", "done", T0 + 4 * DAY)];
    const start = Date.UTC(2026, 10, 3);
    expect(
      phasesOf(task({ boardId: "done", startDate: "2026-11-03", completedAt: T0 + 4 * DAY }), events, BOARDS),
    ).toEqual([
      { state: "wip", from: start },
      { state: "done", from: T0 + 4 * DAY },
    ]);
  });

  it("takes the first state from the first move's source column, and the order of events does not matter", () => {
    const events = [move("review", "done", T0 + 2 * DAY), move("todo", "review", T0 + DAY)];
    expect(phasesOf(task({ boardId: "done", completedAt: T0 + 2 * DAY }), events, BOARDS)).toEqual([
      { state: "planned", from: T0 },
      { state: "wip", from: T0 + DAY },
      { state: "done", from: T0 + 2 * DAY },
    ]);
  });

  it("records a reopen, and reads a deleted column from the move's done flag", () => {
    const events = [
      move(null, "todo", T0),
      move("todo", null, T0 + DAY, true), // a done column since deleted
      move(null, "doing", T0 + 2 * DAY),
    ];
    expect(phasesOf(task({ boardId: "doing" }), events, BOARDS).map((p) => p.state)).toEqual([
      "planned",
      "done",
      "wip",
    ]);
  });

  it("ends in the state now even when the history ends elsewhere", () => {
    // The last recorded move is to the backlog, but the task is done now.
    const done = phasesOf(task({ boardId: "done", completedAt: T0 + 3 * DAY }), [move(null, "todo", T0)], BOARDS);
    expect(done).toEqual([
      { state: "planned", from: T0 },
      { state: "done", from: T0 + 3 * DAY },
    ]);
    const wip = phasesOf(task({ boardId: "doing" }), [move(null, "todo", T0)], BOARDS);
    expect(wip).toEqual([{ state: "wip", from: T0 }]);
  });

  it("ignores another task's events and takes the column roles worked out already", () => {
    const other = { ...move("todo", "doing", T0 + DAY), taskId: "other" };
    expect(phasesOf(task(), [other], boardStates(BOARDS))).toEqual([{ state: "planned", from: T0 }]);
  });
});

describe("stateSegments", () => {
  const opts = { minWidth: 6 };

  it("tiles the bar, each stretch in its state, the first covering everything before the second", () => {
    const marks = [
      { state: "planned" as const, x: 50 },
      { state: "wip" as const, x: 120 },
      { state: "done" as const, x: 200 },
    ];
    expect(stateSegments(marks, 100, 300, opts)).toEqual([
      { x0: 100, x1: 120, state: "planned" },
      { x0: 120, x1: 200, state: "wip" },
      { x0: 200, x1: 300, state: "done" },
    ]);
  });

  it("keeps the state now past the bar's end, and past maxX (the now-line)", () => {
    const marks = [
      { state: "planned" as const, x: 0 },
      { state: "wip" as const, x: 150 },
    ];
    expect(stateSegments(marks, 100, 300, { ...opts, maxX: 120 })).toEqual([
      { x0: 100, x1: 120, state: "planned" },
      { x0: 120, x1: 300, state: "wip" },
    ]);
  });

  it("merges a stretch narrower than minWidth into the one before it (or after, when first)", () => {
    const marks = [
      { state: "planned" as const, x: 0 },
      { state: "wip" as const, x: 150 },
      { state: "planned" as const, x: 153 },
      { state: "wip" as const, x: 200 },
    ];
    // The 3px wip stretch joins the planned one before it; the two planned stretches become one.
    expect(stateSegments(marks, 100, 300, opts)).toEqual([
      { x0: 100, x1: 200, state: "planned" },
      { x0: 200, x1: 300, state: "wip" },
    ]);
    const first = [
      { state: "planned" as const, x: 0 },
      { state: "wip" as const, x: 103 },
    ];
    expect(stateSegments(first, 100, 300, opts)).toEqual([{ x0: 100, x1: 300, state: "wip" }]);
  });

  it("always ends in the state now, at least currentMinWidth wide", () => {
    const marks = [
      { state: "planned" as const, x: 0 },
      { state: "done" as const, x: 299 },
    ];
    expect(stateSegments(marks, 100, 300, { minWidth: 6, currentMinWidth: 18 })).toEqual([
      { x0: 100, x1: 282, state: "planned" },
      { x0: 282, x1: 300, state: "done" },
    ]);
    // A change after the bar's end still shows: the bar ends in the state now.
    const late = [
      { state: "wip" as const, x: 0 },
      { state: "done" as const, x: 400 },
    ];
    expect(stateSegments(late, 100, 300, opts)).toEqual([
      { x0: 100, x1: 294, state: "wip" },
      { x0: 294, x1: 300, state: "done" },
    ]);
  });

  it("is one stretch in the state now on a bar too short for two", () => {
    const marks = [
      { state: "planned" as const, x: 0 },
      { state: "wip" as const, x: 105 },
    ];
    expect(stateSegments(marks, 100, 110, opts)).toEqual([{ x0: 100, x1: 110, state: "wip" }]);
  });

  it("is empty without phases or width, and reads a mark that is not a number as 'before the bar'", () => {
    expect(stateSegments([], 0, 100, opts)).toEqual([]);
    expect(stateSegments([{ state: "wip", x: 0 }], 50, 50, opts)).toEqual([]);
    const marks = [
      { state: "planned" as const, x: 0 },
      { state: "wip" as const, x: Number.NaN },
    ];
    expect(stateSegments(marks, 0, 100, opts)).toEqual([{ x0: 0, x1: 100, state: "wip" }]);
  });
});
