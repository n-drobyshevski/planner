import { describe, it, expect } from "vitest";
import { resolveOccurrenceColor } from "@/lib/calendar/colors";
import { resolveTaskColor } from "@/lib/tasks/colors";
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
  themePreference: "system",
  accent: "terracotta",
  surfaceTone: "warm",
});

function occ(over: Partial<Occurrence>): Occurrence {
  return {
    key: "e:1",
    eventId: "e",
    occurrenceDate: 1,
    start: 1,
    end: 2,
    allDay: false,
    title: "t",
    description: null,
    location: null,
    categoryId: null,
    color: null,
    kind: "event",
    contextId: null,
    ownerId: "m1",
    scope: "personal",
    visibility: "shared",
    taskId: null,
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
    categoryId: null,
    title: "t",
    description: null,
    scope: "personal",
    visibility: "shared",
    color: null,
    status: "todo",
    priority: null,
    dueAt: null,
    position: 0,
    sequential: false,
    completedAt: null,
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
