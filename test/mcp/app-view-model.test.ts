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
