import { describe, it, expect, vi, beforeAll } from "vitest";
import userEvent from "@testing-library/user-event";
import { render, screen, within } from "../test-utils";
import { TaskFlows } from "@/components/tasks/task-flows";
import { SlotTarget, ToolbarSlotsProvider } from "@/components/toolbar-slots";
import { DEFAULT_FLOWS_DISPLAY, type FlowsDisplay } from "@/lib/tasks/flows-display";
import { msToDateInput } from "@/lib/datetime/local";
import { groupByParent, indexById } from "@/lib/tasks/tree";
import type { TaskActions } from "@/components/tasks/task-actions";
import type { Member, TaskRow, TaskStream } from "@/lib/types";

beforeAll(() => {
  // jsdom has no ResizeObserver; the canvas measures itself with one.
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
  // Row menus read matchMedia (useIsMobile); jsdom has none.
  window.matchMedia ??= ((query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList) as typeof window.matchMedia;
});

const NOW = Date.now();
const DAY = 86_400_000;
const today = msToDateInput(NOW, Intl.DateTimeFormat().resolvedOptions().timeZone);
const dayOffset = (n: number) => msToDateInput(Date.parse(`${today}T00:00:00Z`) + n * DAY, "UTC");

function task(id: string, over: Partial<TaskRow> = {}): TaskRow {
  return {
    id,
    workspaceId: "w",
    ownerId: "m1",
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
    createdAt: NOW - 5 * DAY,
    updatedAt: NOW,
    updatedBy: null,
    ...over,
  };
}

const TASKS = [
  task("Draft", { tags: ["thesis"], dueDate: dayOffset(1), priority: 2 }),
  task("Book room", { tags: ["thesis", "admin"], dueDate: dayOffset(-2) }),
  task("Ethics form", { tags: ["admin"] }),
];

const actions: TaskActions = {
  open: vi.fn(),
  toggleDone: vi.fn(),
  move: vi.fn(),
  reorderFlow: vi.fn(),
  create: vi.fn(),
  addSubtask: vi.fn(),
  reparent: vi.fn(),
  promote: vi.fn(),
  changeColor: vi.fn(),
  remove: vi.fn(),
  addCheckpoint: vi.fn(),
  openCheckpoint: vi.fn(),
};

const members = new Map([["m1", { id: "m1", name: "Alex", color: "#c0492a" } as unknown as Member]]);

function renderFlows(display: Partial<FlowsDisplay>, streams: TaskStream[] = []) {
  const onSave = vi.fn(async () => {});
  const byParent = groupByParent(TASKS);
  render(
    <ToolbarSlotsProvider>
      <SlotTarget name="trailing" />
      <TaskFlows
        tasks={byParent.get(null) ?? []}
        childrenByParent={byParent}
        treeById={indexById(TASKS)}
        eventsByTask={new Map()}
        blocksByTask={new Map()}
        checkpointsByTask={new Map()}
        colorOf={() => "#c0492a"}
        lineStyleOf={() => "solid"}
        members={members}
        currentMemberId="m1"
        actions={actions}
        boards={[]}
        collections={[]}
        categories={[]}
        display={{ ...DEFAULT_FLOWS_DISPLAY, ...display }}
        onDisplayChange={vi.fn()}
        onResetDisplay={vi.fn()}
        savedStreams={{ streams, onSave, onRename: vi.fn(), onDelete: vi.fn() }}
      />
    </ToolbarSlotsProvider>,
  );
  return { onSave };
}

describe("TaskFlows — tags, attention and streams", () => {
  it("shows a two-tag task once in each tag's group", () => {
    renderFlows({ groupBy: "tag" });
    expect(screen.getAllByRole("button", { name: "Book room" })).toHaveLength(2);
    expect(screen.getAllByRole("button", { name: "Move Book room" })).toHaveLength(2);
  });

  it("marks lanes that need attention with a spoken reason", () => {
    renderFlows({ groupBy: "none", attention: "deadline" });
    expect(screen.getByText("Needs attention now: due tomorrow")).toBeInTheDocument();
    expect(screen.getByText("Needs attention now: overdue 2 days")).toBeInTheDocument();
  });

  it("collapses each group to a stream that expands to its lanes", async () => {
    const user = userEvent.setup();
    renderFlows({ groupBy: "tag", mode: "streams" });
    expect(screen.queryByRole("button", { name: "Draft" })).toBeNull();
    const thesis = screen.getByRole("button", { name: /^Show the tasks in thesis\./ });
    expect(thesis).toHaveAttribute("aria-expanded", "false");
    expect(thesis.getAttribute("aria-label")).toMatch(/2 open.*needs attention: 2/);
    await user.click(thesis);
    expect(screen.getByRole("button", { name: /^Hide the tasks in thesis\./ })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    expect(screen.getByRole("button", { name: "Draft" })).toBeInTheDocument();
  });

  it("refuses a duplicate saved-stream name with an inline error", async () => {
    const user = userEvent.setup();
    const existing: TaskStream = {
      id: "s1",
      workspaceId: "w",
      memberId: "m1",
      name: "Thesis",
      definition: DEFAULT_FLOWS_DISPLAY,
      position: 0,
      createdAt: NOW,
      updatedAt: NOW,
    };
    const { onSave } = renderFlows({ groupBy: "tag" }, [existing]);
    await user.click(screen.getByRole("button", { name: "Display options" }));
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Save as stream…" }));
    await user.type(within(dialog).getByRole("textbox", { name: "Name for the current display" }), "thesis{Enter}");
    expect(within(dialog).getByRole("alert")).toHaveTextContent("You already have a stream with that name.");
    expect(onSave).not.toHaveBeenCalled();
    await user.clear(within(dialog).getByRole("textbox", { name: "Name for the current display" }));
    await user.type(within(dialog).getByRole("textbox", { name: "Name for the current display" }), "Home{Enter}");
    expect(onSave).toHaveBeenCalledWith("Home", expect.objectContaining({ groupBy: "tag" }));
  });
});
