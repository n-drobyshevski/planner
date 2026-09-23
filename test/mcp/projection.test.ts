import { describe, it, expect } from "vitest";
import { projectAgenda, projectAgendaTasks } from "@/lib/mcp/projection";
import type { Occurrence, TaskRow } from "@/lib/types";

const ME = "m-me";
const PARTNER = "m-partner";

function occ(partial: Partial<Occurrence> & { title: string }): Occurrence {
  return {
    key: `${partial.eventId ?? "e"}:${partial.occurrenceDate ?? 0}`,
    eventId: "e1",
    occurrenceDate: 0,
    start: 0,
    end: 3_600_000,
    allDay: false,
    inactive: false,
    status: "confirmed",
    description: null,
    location: null,
    categoryId: null,
    color: null,
    kind: "event",
    ownerId: ME,
    isPrivate: false,
    isShared: false,
    hiddenFromPublic: false,
    taskId: null,
    attributes: {},
    isRecurring: false,
    isException: false,
    ...partial,
  };
}

describe("projectAgenda", () => {
  it("keeps the caller's own occurrences with id/title/location", () => {
    const out = projectAgenda(
      [occ({ eventId: "e1", title: "Dentist", location: "Clinic", ownerId: ME })],
      ME,
      "none",
    );
    expect(out).toEqual([
      {
        owner: "me",
        id: "e1",
        title: "Dentist",
        start: new Date(0).toISOString(),
        end: new Date(3_600_000).toISOString(),
        allDay: false,
        location: "Clinic",
      },
    ]);
  });

  it("drops every partner occurrence in 'none' mode — never a title, id, or time leak", () => {
    const partnerOcc = occ({ title: "Therapy — sensitive", ownerId: PARTNER, isPrivate: false });
    const out = projectAgenda([partnerOcc], ME, "none");
    expect(out).toEqual([]);
  });

  it("'busy' mode gives times only — no title, no id, ever", () => {
    const partnerOcc = occ({ title: "Therapy — sensitive", ownerId: PARTNER, isPrivate: false });
    const out = projectAgenda([partnerOcc], ME, "busy");
    expect(out).toEqual([
      {
        owner: "partner",
        busy: true,
        start: new Date(0).toISOString(),
        end: new Date(3_600_000).toISOString(),
        allDay: false,
      },
    ]);
    // No id/title field appears anywhere in the serialized output.
    expect(JSON.stringify(out)).not.toContain("Therapy");
    expect(JSON.stringify(out).includes('"id"')).toBe(false);
  });

  it("'shared' mode includes the partner's non-private title but never an id or location", () => {
    const partnerOcc = occ({
      title: "Family dinner",
      ownerId: PARTNER,
      isPrivate: false,
      location: "Home",
    });
    const out = projectAgenda([partnerOcc], ME, "shared");
    expect(out).toEqual([
      {
        owner: "partner",
        title: "Family dinner",
        start: new Date(0).toISOString(),
        end: new Date(3_600_000).toISOString(),
        allDay: false,
      },
    ]);
  });

  it("a private partner occurrence never appears, even in 'shared' mode (defense in depth)", () => {
    const privateOcc = occ({ title: "Secret", ownerId: PARTNER, isPrivate: true });
    for (const mode of ["none", "busy", "shared"] as const) {
      const out = projectAgenda([privateOcc], ME, mode);
      expect(out).toEqual([]);
    }
  });

  it("drops inactive and cancelled occurrences", () => {
    const out = projectAgenda(
      [
        occ({ title: "Sleep", ownerId: ME, inactive: true }),
        occ({ title: "Cancelled meeting", ownerId: ME, status: "cancelled" }),
        occ({ title: "Keeper", ownerId: ME }),
      ],
      ME,
      "none",
    );
    expect(out.map((e) => (e as { title?: string }).title)).toEqual(["Keeper"]);
  });

  it("clips a title over 120 chars", () => {
    const longTitle = "x".repeat(200);
    const out = projectAgenda([occ({ title: longTitle, ownerId: ME })], ME, "none");
    expect((out[0] as { title: string }).title).toHaveLength(120);
  });

  it("sorts the result by start", () => {
    const out = projectAgenda(
      [
        occ({ title: "Second", ownerId: ME, start: 2000, end: 3000 }),
        occ({ title: "First", ownerId: ME, start: 1000, end: 1500 }),
      ],
      ME,
      "none",
    );
    expect(out.map((e) => (e as { title?: string }).title)).toEqual(["First", "Second"]);
  });
});

function task(partial: Partial<TaskRow> & { id: string; title: string }): TaskRow {
  return {
    workspaceId: "w1",
    ownerId: ME,
    assigneeId: null,
    parentId: null,
    collectionId: null,
    categoryId: null,
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
    ...partial,
  };
}

describe("projectAgendaTasks", () => {
  it("includes a task due on or before the window's last day", () => {
    const out = projectAgendaTasks(
      [{ ...task({ id: "t1", title: "Due soon", dueDate: "2026-09-24" }), status: "todo" }],
      ME,
      "2026-09-23",
      "2026-09-24",
    );
    expect(out.map((t) => t.id)).toEqual(["t1"]);
  });

  it("excludes a task due after the window", () => {
    const out = projectAgendaTasks(
      [{ ...task({ id: "t1", title: "Later", dueDate: "2026-10-01" }), status: "todo" }],
      ME,
      "2026-09-23",
      "2026-09-24",
    );
    expect(out).toEqual([]);
  });

  it("includes a due-less in_progress task, excludes a due-less todo task", () => {
    const out = projectAgendaTasks(
      [
        { ...task({ id: "t1", title: "Ongoing" }), status: "in_progress" },
        { ...task({ id: "t2", title: "Someday" }), status: "todo" },
      ],
      ME,
      "2026-09-23",
      "2026-09-24",
    );
    expect(out.map((t) => t.id)).toEqual(["t1"]);
  });

  it("marks overdue when the due date is before today, not on it", () => {
    const out = projectAgendaTasks(
      [
        { ...task({ id: "t1", title: "Past due", dueDate: "2026-09-20" }), status: "todo" },
        { ...task({ id: "t2", title: "Due today", dueDate: "2026-09-23" }), status: "todo" },
      ],
      ME,
      "2026-09-23",
      "2026-09-24",
    );
    expect(out.find((t) => t.id === "t1")?.overdue).toBe(true);
    expect(out.find((t) => t.id === "t2")?.overdue).toBe(false);
  });

  it("excludes another member's tasks and completed tasks", () => {
    const out = projectAgendaTasks(
      [
        { ...task({ id: "t1", title: "Partner's", ownerId: PARTNER, dueDate: "2026-09-24" }), status: "todo" },
        { ...task({ id: "t2", title: "Done", dueDate: "2026-09-24", completedAt: 123 }), status: "todo" },
      ],
      ME,
      "2026-09-23",
      "2026-09-24",
    );
    expect(out).toEqual([]);
  });

  it("includes both top-level tasks and subtasks", () => {
    const out = projectAgendaTasks(
      [
        { ...task({ id: "t1", title: "Top", dueDate: "2026-09-24" }), status: "todo" },
        {
          ...task({ id: "t2", title: "Sub", parentId: "t1", dueDate: "2026-09-24" }),
          status: "todo",
        },
      ],
      ME,
      "2026-09-23",
      "2026-09-24",
    );
    expect(out.map((t) => t.id).sort()).toEqual(["t1", "t2"]);
  });
});
