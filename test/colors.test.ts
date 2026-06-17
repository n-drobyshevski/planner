import { describe, it, expect } from "vitest";
import { resolveOccurrenceColor, resolveBlockColor } from "@/lib/calendar/colors";
import { resolveTaskColor } from "@/lib/tasks/colors";
import { toPaletteColor } from "@/lib/theme/appearance";
import type { Category, Member, Occurrence, TaskRow } from "@/lib/types";

const cat = (id: string, color: string): Category => ({
  id,
  workspaceId: "w",
  ownerId: null,
  name: id,
  color,
  sortOrder: 0,
});

const member = (id: string, color: string): Member => ({
  id,
  workspaceId: "w",
  authUserId: null,
  name: id,
  color,
  hasPin: false,
  locale: "en",
  themePreference: "system",
  accent: "peach",
  surfaceTone: "warm",
  palette: "default",
  timezone: null,
  secondaryTimezone: null,
  showInactiveInMonth: true,
  showSuccessToasts: true,
  contextLabel: "bar",
});

function occ(over: Partial<Occurrence>): Occurrence {
  return {
    key: "e:1",
    eventId: "e",
    occurrenceDate: 1,
    start: 1,
    end: 2,
    allDay: false,
    inactive: false,
    status: "confirmed",
    title: "t",
    description: null,
    location: null,
    categoryId: null,
    color: null,
    kind: "event",
    ownerId: "m1",
    isPrivate: false,
    isShared: false,
    taskId: null,
    attributes: {},
    isRecurring: false,
    isException: false,
    ...over,
  };
}

function task(over: Partial<TaskRow>): TaskRow {
  return {
    id: "t1",
    workspaceId: "w",
    ownerId: "m1",
    assigneeId: null,
    parentId: null,
    collectionId: null,
    categoryId: null,
    title: "t",
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
    createdAt: 0,
    updatedAt: 0,
    ...over,
  };
}

describe("resolveOccurrenceColor", () => {
  const categories = new Map([["c1", cat("c1", "#111111")]]);
  const members = new Map([["m1", member("m1", "#222222")]]);

  it("prefers the occurrence's own color over category and member", () => {
    const o = occ({ color: "#abcdef", categoryId: "c1" });
    expect(resolveOccurrenceColor(o, categories, members)).toBe("#abcdef");
  });

  it("falls back to category color when no own color", () => {
    const o = occ({ categoryId: "c1" });
    expect(resolveOccurrenceColor(o, categories, members)).toBe("#111111");
  });

  it("falls back to member color when no own color or category", () => {
    const o = occ({ ownerId: "m1" });
    expect(resolveOccurrenceColor(o, categories, members)).toBe("#222222");
  });
});

describe("resolveTaskColor", () => {
  const categories = new Map([["c1", cat("c1", "#111111")]]);
  const members = new Map([["m1", member("m1", "#222222")]]);

  it("prefers the task's own color over category and member", () => {
    const t = task({ color: "#abcdef", categoryId: "c1", assigneeId: "m1" });
    expect(resolveTaskColor(t, categories, members)).toBe("#abcdef");
  });

  it("falls back to category color when no own color", () => {
    const t = task({ categoryId: "c1" });
    expect(resolveTaskColor(t, categories, members)).toBe("#111111");
  });
});

describe("resolveBlockColor", () => {
  const categories = new Map([
    ["c1", cat("c1", "#111111")],
    ["c2", cat("c2", "#999999")],
  ]);
  const members = new Map([["m1", member("m1", "#222222")]]);

  it("follows the linked task's color override, not the occurrence's category", () => {
    const o = occ({ taskId: "t1", categoryId: "c1" }); // occ alone -> #111111
    const tasks = new Map([["t1", task({ id: "t1", color: "#abcdef" })]]);
    expect(resolveBlockColor(o, tasks, categories, members)).toBe("#abcdef");
  });

  it("follows the linked task's category when the task has no override", () => {
    const o = occ({ taskId: "t1", categoryId: "c1" }); // occ category c1 -> #111111
    const tasks = new Map([["t1", task({ id: "t1", categoryId: "c2" })]]); // task -> #999999
    expect(resolveBlockColor(o, tasks, categories, members)).toBe("#999999");
  });

  it("falls back to occurrence resolution for a plain (non-task) event", () => {
    const o = occ({ taskId: null, categoryId: "c1" });
    expect(resolveBlockColor(o, new Map(), categories, members)).toBe("#111111");
  });

  it("falls back to occurrence resolution when the task isn't loaded", () => {
    const o = occ({ taskId: "missing", color: "#abcdef" });
    expect(resolveBlockColor(o, new Map(), categories, members)).toBe("#abcdef");
  });
});

describe("toPaletteColor", () => {
  it("maps a known accent hex to its palette-aware CSS var", () => {
    expect(toPaletteColor("#c0492a")).toBe("var(--swatch-peach)");
    expect(toPaletteColor("#0f766e")).toBe("var(--swatch-teal)");
  });

  it("is case-insensitive on the hex", () => {
    expect(toPaletteColor("#C0492A")).toBe("var(--swatch-peach)");
  });

  it("passes unknown/custom hexes through unchanged", () => {
    expect(toPaletteColor("#123456")).toBe("#123456");
  });

  it("returns undefined for nullish input", () => {
    expect(toPaletteColor(null)).toBeUndefined();
    expect(toPaletteColor(undefined)).toBeUndefined();
    expect(toPaletteColor("")).toBeUndefined();
  });
});
