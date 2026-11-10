import { describe, expect, it } from "vitest";

import type { FlowStreamOut, FlowTaskOut } from "@/lib/mcp/flows";
import {
  STRIP_NOW_X,
  attentionLevel,
  daysBetween,
  deadlineLabel,
  pickLocale,
  streamSummary,
  stripMarks,
  taskDetail,
} from "@/lib/mcp/app/view-model";

const TODAY = "2026-11-10";
const task = (partial: Partial<FlowTaskOut> = {}): FlowTaskOut => ({
  id: "t1",
  title: "Task",
  score: 0.5,
  overdue: false,
  ...partial,
});
const stream = (partial: Partial<FlowStreamOut> = {}): FlowStreamOut => ({
  key: "tag:thesis",
  label: "thesis",
  open: 3,
  done: 1,
  overdue: 0,
  needsAttention: 1,
  score: 0.6,
  tasks: [],
  ...partial,
});

describe("daysBetween", () => {
  it("counts whole days across a month and a DST change", () => {
    expect(daysBetween(TODAY, "2026-11-10")).toBe(0);
    expect(daysBetween(TODAY, "2026-12-01")).toBe(21);
    expect(daysBetween("2026-10-24", "2026-10-26")).toBe(2);
    expect(daysBetween(TODAY, "2026-11-08")).toBe(-2);
  });
});

describe("deadlineLabel", () => {
  it("speaks relative inside the strip and absolute beyond it", () => {
    expect(deadlineLabel("2026-11-10", TODAY, "en")).toBe("today");
    expect(deadlineLabel("2026-11-11", TODAY, "en")).toBe("tomorrow");
    expect(deadlineLabel("2026-11-14", TODAY, "en")).toBe("in 4d");
    expect(deadlineLabel("2026-11-08", TODAY, "en")).toBe("2d late");
    expect(deadlineLabel("2026-12-25", TODAY, "en")).toBe("25 Dec");
  });

  it("declines Russian day counts", () => {
    expect(deadlineLabel("2026-11-11", TODAY, "ru")).toBe("завтра");
    expect(deadlineLabel("2026-11-12", TODAY, "ru")).toBe("через 2 дня");
    expect(deadlineLabel("2026-11-15", TODAY, "ru")).toBe("через 5 дней");
    expect(deadlineLabel("2026-11-09", TODAY, "ru")).toBe("опоздание 1 день");
    expect(deadlineLabel("2026-10-30", TODAY, "ru")).toBe("опоздание 11 дней");
  });

  it("has nothing to say without a usable date", () => {
    expect(deadlineLabel(undefined, TODAY, "en")).toBeNull();
    expect(deadlineLabel("soon", TODAY, "en")).toBeNull();
  });
});

describe("attentionLevel", () => {
  it("matches the web app's thresholds", () => {
    expect(attentionLevel(0.75)).toBe("now");
    expect(attentionLevel(0.74)).toBe("soon");
    expect(attentionLevel(0.5)).toBe("soon");
    expect(attentionLevel(0.49)).toBe("none");
  });
});

describe("taskDetail", () => {
  it("joins the deadline and the priority, skipping what is absent", () => {
    expect(taskDetail(task({ dueDate: "2026-11-11", priority: 3 }), TODAY, "en")).toBe("tomorrow · high");
    expect(taskDetail(task({ priority: 1 }), TODAY, "ru")).toBe("низкий");
    expect(taskDetail(task({ priority: 0 }), TODAY, "en")).toBe("");
  });
});

describe("streamSummary", () => {
  it("leads with the open count and adds what presses", () => {
    expect(streamSummary(stream({ nextDue: "2026-11-13" }), TODAY, "en")).toBe("3 open · next in 3d");
    expect(streamSummary(stream({ overdue: 1, nextDue: "2026-11-08" }), TODAY, "en")).toBe("3 open · 1 overdue");
    expect(streamSummary(stream({ open: 0 }), TODAY, "ru")).toBe("Открытых нет");
  });
});

describe("stripMarks", () => {
  it("places deadlines by day, merging a shared day and clamping the far ones", () => {
    const marks = stripMarks(
      [
        task({ dueDate: "2026-11-10" }),
        task({ dueDate: "2026-11-12" }),
        task({ dueDate: "2026-11-12" }),
        task({ dueDate: "2026-09-01", overdue: true }),
        task({ dueDate: "2027-03-01" }),
        task({}),
      ],
      TODAY,
    );
    expect(marks.map((m) => m.count)).toEqual([1, 1, 2, 1]);
    expect(marks[0]).toMatchObject({ x: 0, overdue: true });
    expect(marks[1].x).toBeCloseTo(STRIP_NOW_X);
    expect(marks[3].x).toBe(1);
    expect(marks.every((m) => m.x >= 0 && m.x <= 1)).toBe(true);
  });
});

describe("pickLocale", () => {
  it("is Russian for ru tags and English otherwise", () => {
    expect(pickLocale("ru-RU")).toBe("ru");
    expect(pickLocale("RU")).toBe("ru");
    expect(pickLocale("fr")).toBe("en");
    expect(pickLocale(undefined)).toBe("en");
  });
});

import {
  RUNWAY_NOW_X,
  calendarDays,
  nowItems,
  runwayLabelSide,
  runwayOf,
  runwayTicks,
} from "@/lib/mcp/app/view-model";

describe("runwayOf", () => {
  it("runs from the start to the deadline, with progress as its fill", () => {
    const r = runwayOf(
      task({ start: "2026-11-03", dueDate: "2026-11-17", progress: { done: 2, total: 5 } }),
      TODAY,
    );
    expect(r.state).toBe("open");
    expect(r.x0).toBeCloseTo(7 / 35);
    expect(r.x1).toBeCloseTo(21 / 35);
    expect(r.fill).toBeCloseTo(0.4);
    expect(r.over).toBeNull();
    expect(r.x0 < RUNWAY_NOW_X && RUNWAY_NOW_X < r.x1).toBe(true);
  });

  it("gives a late task its overrun, from the deadline to today", () => {
    const r = runwayOf(task({ start: "2026-11-01", dueDate: "2026-11-08", overdue: true }), TODAY);
    expect(r.state).toBe("late");
    expect(r.over).toEqual({ x0: r.x1, x1: RUNWAY_NOW_X });
    expect(r.fill).toBe(0);
  });

  it("leaves an undated task open-ended, a little past today", () => {
    const r = runwayOf(task({ start: "2026-11-05" }), TODAY);
    expect(r.state).toBe("open-ended");
    expect(r.x1).toBeGreaterThan(RUNWAY_NOW_X);
    expect(r.over).toBeNull();
  });

  it("marks a task that has not started as planned", () => {
    expect(runwayOf(task({ start: "2026-11-16", dueDate: "2026-11-28" }), TODAY).state).toBe("planned");
  });

  it("clamps into the track and says which ends are cut off", () => {
    const r = runwayOf(task({ start: "2026-09-01", dueDate: "2027-01-15" }), TODAY);
    expect([r.x0, r.x1, r.clippedStart, r.clippedEnd]).toEqual([0, 1, true, true]);
  });

  it("always leaves a bar one can see, whatever the dates say", () => {
    for (const t of [
      task({ start: "2026-11-12", dueDate: "2026-11-12" }),
      task({ start: "2026-11-20", dueDate: "2026-11-11" }),
      task({ dueDate: "2026-11-12" }),
      task({}),
      task({ start: "nonsense", dueDate: "nonsense" }),
      task({ start: "2026-12-30", dueDate: "2026-12-31" }),
    ]) {
      const r = runwayOf(t, TODAY);
      expect(r.x1).toBeGreaterThan(r.x0);
      expect(r.x0).toBeGreaterThanOrEqual(0);
      expect(r.x1).toBeLessThanOrEqual(1);
    }
  });
});

describe("runwayLabelSide", () => {
  it("puts the words after the bar, before it near the right edge, inside a full-width one", () => {
    expect(runwayLabelSide(runwayOf(task({ start: "2026-11-03", dueDate: "2026-11-12" }), TODAY))).toBe("after");
    expect(runwayLabelSide(runwayOf(task({ start: "2026-11-20", dueDate: "2026-11-30" }), TODAY))).toBe("before");
    expect(runwayLabelSide(runwayOf(task({ start: "2026-09-01", dueDate: "2026-12-20" }), TODAY))).toBe("inside");
  });
});

describe("runwayTicks", () => {
  it("labels Mondays, but none under the Now pill or at the cut-off right edge", () => {
    const ticks = runwayTicks(TODAY, "en");
    expect(ticks.map((t) => t.label)).toEqual(["2 Nov", "16 Nov", "23 Nov"]);
    expect(ticks.every((t) => t.x > 0 && t.x < 0.95)).toBe(true);
  });
});

describe("nowItems", () => {
  it("lists each pressing task once, most pressing first, with every stream it is in", () => {
    const shared = task({ id: "a", title: "Shared", score: 0.9, dueDate: "2026-11-08" });
    const items = nowItems([
      stream({ label: "thesis", tasks: [shared, task({ id: "b", score: 0.6 }), task({ id: "c", score: 0.2 })] }),
      stream({ label: "admin", tasks: [shared, task({ id: "d", score: 0.6, dueDate: "2026-11-12" })] }),
    ]);
    expect(items.map((i) => i.task.id)).toEqual(["a", "d", "b"]);
    expect(items[0].streams).toEqual(["thesis", "admin"]);
  });
});

describe("calendarDays", () => {
  const localDate = (iso: string) => iso.slice(0, 10);
  const localTime = (iso: string) => iso.slice(11, 16);

  it("files events and due tasks under their day, in order", () => {
    const days = calendarDays(
      TODAY,
      3,
      [
        { title: "Late call", start: "2026-11-10T19:00:00Z", end: "2026-11-10T20:00:00Z", allDay: false },
        { title: "Standup", start: "2026-11-10T09:00:00Z", end: "2026-11-10T09:15:00Z", allDay: false },
        { title: "Inspection", start: "2026-11-12T00:00:00Z", end: "2026-11-13T00:00:00Z", allDay: true },
        { title: "Next week", start: "2026-11-20T09:00:00Z", end: "2026-11-20T10:00:00Z", allDay: false },
      ],
      [
        stream({ tasks: [task({ id: "a", dueDate: "2026-11-11" })] }),
        stream({ tasks: [task({ id: "a", dueDate: "2026-11-11" }), task({ id: "b" })] }),
      ],
      localDate,
      localTime,
    );
    expect(days.map((d) => d.date)).toEqual(["2026-11-10", "2026-11-11", "2026-11-12"]);
    expect(days[0].events).toEqual([
      { title: "Standup", time: "09:00" },
      { title: "Late call", time: "19:00" },
    ]);
    expect(days[1].due.map((t) => t.id)).toEqual(["a"]);
    expect(days[2].events).toEqual([{ title: "Inspection", time: null }]);
  });

  it("reads an all-day date from the string, never through the viewer's zone", () => {
    const shifted = () => "2026-11-11";
    const days = calendarDays(
      TODAY,
      2,
      [{ title: "Floating", start: "2026-11-10T00:00:00Z", end: "2026-11-11T00:00:00Z", allDay: true }],
      [],
      shifted,
      () => "00:00",
    );
    expect(days[0].events).toHaveLength(1);
    expect(days[1].events).toHaveLength(0);
  });
});

import { EMPTY_DRAFT, createArgs, draftOf, draftTags, updateArgs } from "@/lib/mcp/app/view-model";

describe("editing drafts", () => {
  const original = { title: "Write", dueDate: "2026-11-20", priority: 2, tags: ["thesis", "writing"] };

  it("round-trips a task into a draft", () => {
    expect(draftOf(original)).toEqual({
      title: "Write",
      dueDate: "2026-11-20",
      startDate: "",
      priority: "2",
      tags: "thesis, writing",
      collection: "",
    });
    expect(draftOf({ title: "Bare", tags: [], priority: 0 })).toEqual({ ...EMPTY_DRAFT, title: "Bare" });
  });

  it("reads tags as typed: commas, stray spaces, repeats", () => {
    expect(draftTags({ ...EMPTY_DRAFT, tags: " a, b ,, a ,#c" })).toEqual(["a", "b", "#c"]);
  });

  it("builds create arguments with only what was filled in", () => {
    expect(createArgs({ ...EMPTY_DRAFT, title: "  New  " })).toEqual({ title: "New" });
    expect(
      createArgs(
        { title: "Sub", dueDate: "2026-11-12", startDate: "bad", priority: "3", tags: "x", collection: "col-1" },
        "parent-1",
      ),
    ).toEqual({ title: "Sub", parentId: "parent-1", dueDate: "2026-11-12", priority: 3, tags: ["x"] });
    // A top-level task names its collection; a subtask (above) never does.
    expect(createArgs({ ...EMPTY_DRAFT, title: "Top", collection: "col-1" })).toEqual({
      title: "Top",
      collectionId: "col-1",
    });
    expect(createArgs({ ...EMPTY_DRAFT, title: "   " })).toBeNull();
  });

  it("sends only what changed, and clears with null or []", () => {
    expect(updateArgs(original, draftOf(original))).toEqual({});
    expect(updateArgs(original, { ...draftOf(original), title: "Rewrite" })).toEqual({ title: "Rewrite" });
    expect(updateArgs(original, { ...draftOf(original), dueDate: "", priority: "", tags: "" })).toEqual({
      dueDate: null,
      priority: null,
      tags: [],
    });
    expect(updateArgs(original, { ...draftOf(original), startDate: "2026-11-01" })).toEqual({
      startDate: "2026-11-01",
    });
    expect(updateArgs(original, { ...draftOf(original), collection: "col-2" })).toEqual({ collectionId: "col-2" });
    expect(
      updateArgs({ ...original, collectionId: "col-1" }, { ...draftOf(original), collection: "" }),
    ).toEqual({ collectionId: null });
    expect(updateArgs(original, { ...draftOf(original), title: " " })).toBeNull();
  });
});
