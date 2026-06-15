import { describe, it, expect } from "vitest";
import {
  mapEvent,
  mapMember,
  mapSleepLog,
  mapTask,
  eventInputToRow,
  eventPatchToRow,
  sleepLogInputToRow,
  taskInputToRow,
  taskPatchToRow,
  type EventInput,
  type SleepLogInput,
  type TaskInput,
} from "@/lib/supabase/mappers";

const baseRow = {
  id: "e1",
  workspace_id: "w1",
  owner_id: "m1",
  category_id: null,
  title: "Work",
  description: null,
  location: null,
  is_private: false,
  color: null,
  all_day: false,
  starts_at: "2026-06-01T09:00:00.000Z",
  ends_at: "2026-06-01T17:00:00.000Z",
  time_zone: "America/New_York",
  rrule: null,
  recurrence_ends_at: null,
  task_id: null,
  created_at: "2026-06-01T00:00:00.000Z",
  updated_at: "2026-06-01T00:00:00.000Z",
};

describe("mapEvent — kind", () => {
  it("reads kind from the row", () => {
    const ctx = mapEvent({ ...baseRow, kind: "context" });
    expect(ctx.kind).toBe("context");

    // A context window paints a category via its own category_id.
    const painted = mapEvent({ ...baseRow, kind: "context", category_id: "cat-1" });
    expect(painted.categoryId).toBe("cat-1");
  });

  it("defaults kind to event when the column is missing", () => {
    expect(mapEvent(baseRow).kind).toBe("event");
  });
});

describe("is_shared round-trip", () => {
  it("mapEvent reads is_shared (false when the column is missing)", () => {
    expect(mapEvent(baseRow).isShared).toBe(false);
    expect(mapEvent({ ...baseRow, is_shared: true }).isShared).toBe(true);
  });

  it("eventInputToRow defaults is_shared false and passes it through", () => {
    const input: EventInput = {
      workspaceId: "w1",
      ownerId: "m1",
      title: "Work",
      start: 0,
      end: 1,
      timeZone: "UTC",
    };
    expect(eventInputToRow(input).is_shared).toBe(false);
    expect(eventInputToRow({ ...input, isShared: true }).is_shared).toBe(true);
  });

  it("eventPatchToRow only writes is_shared when present in the patch", () => {
    expect(eventPatchToRow({ isShared: true })).toEqual({ is_shared: true });
    expect(eventPatchToRow({ isShared: false })).toEqual({ is_shared: false });
    expect(eventPatchToRow({ title: "x" })).not.toHaveProperty("is_shared");
  });
});

describe("eventInputToRow — kind/category", () => {
  const input: EventInput = {
    workspaceId: "w1",
    ownerId: "m1",
    title: "Work",
    isPrivate: false,
    start: 0,
    end: 1,
    timeZone: "UTC",
  };

  it("defaults to a normal event", () => {
    const row = eventInputToRow(input);
    expect(row.kind).toBe("event");
    expect(row).not.toHaveProperty("context_id");
  });

  it("passes through kind and the painted category", () => {
    const row = eventInputToRow({ ...input, kind: "context", categoryId: "cat-1" });
    expect(row.kind).toBe("context");
    expect(row.category_id).toBe("cat-1");
  });
});

describe("eventPatchToRow — kind/category", () => {
  it("only writes fields present in the patch (and never context_id)", () => {
    expect(eventPatchToRow({ title: "x" })).not.toHaveProperty("context_id");
    expect(eventPatchToRow({ categoryId: "cat-1" })).toEqual({ category_id: "cat-1" });
    expect(eventPatchToRow({ categoryId: null })).toEqual({ category_id: null });
    expect(eventPatchToRow({ kind: "context" })).toEqual({ kind: "context" });
  });
});

const baseTaskRow = {
  id: "t1",
  workspace_id: "w1",
  owner_id: "m1",
  assignee_id: null,
  parent_id: null,
  collection_id: null,
  category_id: null,
  title: "Task",
  description: null,
  is_private: false,
  color: null,
  board_id: null,
  priority: null,
  due_date: null,
  position: 0,
  sequential: false,
  completed_at: null,
  created_at: "2026-06-01T00:00:00.000Z",
  updated_at: "2026-06-01T00:00:00.000Z",
};

describe("attributes round-trip", () => {
  it("mapEvent/mapTask read attributes leniently ({} when missing or junk)", () => {
    expect(mapEvent(baseRow).attributes).toEqual({});
    expect(mapEvent({ ...baseRow, attributes: "junk" }).attributes).toEqual({});
    expect(
      mapEvent({ ...baseRow, attributes: { energy: 2, mood: "calm" } }).attributes,
    ).toEqual({ energy: 2, mood: "calm" });
    // invalid known key drops, unknown sibling survives
    expect(
      mapEvent({ ...baseRow, attributes: { energy: 9, mood: "calm" } }).attributes,
    ).toEqual({ mood: "calm" });

    expect(mapTask(baseTaskRow).attributes).toEqual({});
    expect(
      mapTask({ ...baseTaskRow, attributes: { focus: "deep" } }).attributes,
    ).toEqual({ focus: "deep" });
  });

  it("input mappers default attributes to {} and pass them through", () => {
    const eventInput: EventInput = {
      workspaceId: "w1",
      ownerId: "m1",
      title: "Work",
      start: 0,
      end: 1,
      timeZone: "UTC",
    };
    expect(eventInputToRow(eventInput).attributes).toEqual({});
    expect(
      eventInputToRow({ ...eventInput, attributes: { energy: 1 } }).attributes,
    ).toEqual({ energy: 1 });

    const taskInput: TaskInput = { workspaceId: "w1", ownerId: "m1", title: "Task" };
    expect(taskInputToRow(taskInput).attributes).toEqual({});
    expect(
      taskInputToRow({ ...taskInput, attributes: { focus: "shallow" } }).attributes,
    ).toEqual({ focus: "shallow" });
  });

  it("patch mappers write attributes only when present in the patch", () => {
    expect(eventPatchToRow({ title: "x" })).not.toHaveProperty("attributes");
    expect(eventPatchToRow({ attributes: { energy: 3 } })).toEqual({
      attributes: { energy: 3 },
    });
    expect(taskPatchToRow({ title: "x" })).not.toHaveProperty("attributes");
    expect(taskPatchToRow({ attributes: { satisfaction: 5 } })).toEqual({
      attributes: { satisfaction: 5 },
    });
  });
});

const baseSleepRow = {
  id: "s1",
  workspace_id: "w1",
  member_id: "m1",
  date: "2026-06-10",
  bedtime_at: "2026-06-09T21:00:00.000Z",
  woke_at: "2026-06-10T05:30:00.000Z",
  quality: 4,
  fatigue: 3,
  note: "fine",
  created_at: "2026-06-10T06:00:00.000Z",
};

describe("sleep log mappers", () => {
  it("mapSleepLog converts timestamps to ms and keeps the date token verbatim", () => {
    const log = mapSleepLog(baseSleepRow);
    expect(log.date).toBe("2026-06-10");
    expect(log.bedtimeAt).toBe(Date.UTC(2026, 5, 9, 21));
    expect(log.wokeAt).toBe(Date.UTC(2026, 5, 10, 5, 30));
    expect(log.quality).toBe(4);
    expect(log.fatigue).toBe(3);
    expect(log.note).toBe("fine");
  });

  it("mapSleepLog tolerates the all-optional fields being null", () => {
    const log = mapSleepLog({
      ...baseSleepRow,
      bedtime_at: null,
      woke_at: null,
      quality: null,
      fatigue: null,
      note: null,
    });
    expect(log.bedtimeAt).toBeNull();
    expect(log.wokeAt).toBeNull();
    expect(log.quality).toBeNull();
    expect(log.fatigue).toBeNull();
    expect(log.note).toBeNull();
  });

  it("sleepLogInputToRow writes snake_case with nulls for absent optionals", () => {
    const input: SleepLogInput = {
      workspaceId: "w1",
      memberId: "m1",
      date: "2026-06-10",
      quality: 5,
    };
    const row = sleepLogInputToRow(input);
    expect(row.workspace_id).toBe("w1");
    expect(row.member_id).toBe("m1");
    expect(row.date).toBe("2026-06-10");
    expect(row.quality).toBe(5);
    expect(row.fatigue).toBeNull();
    expect(row.bedtime_at).toBeNull();
    expect(row.woke_at).toBeNull();
    expect(row.note).toBeNull();
  });

  it("sleepLogInputToRow encodes instants as ISO strings", () => {
    const row = sleepLogInputToRow({
      workspaceId: "w1",
      memberId: "m1",
      date: "2026-06-10",
      bedtimeAt: Date.UTC(2026, 5, 9, 21),
      wokeAt: Date.UTC(2026, 5, 10, 5, 30),
    });
    expect(typeof row.bedtime_at).toBe("string");
    expect(toMsBack(row.bedtime_at as string)).toBe(Date.UTC(2026, 5, 9, 21));
    expect(toMsBack(row.woke_at as string)).toBe(Date.UTC(2026, 5, 10, 5, 30));
  });
});

function toMsBack(iso: string): number {
  return new Date(iso).getTime();
}

describe("mapMember — sleep preferences", () => {
  const memberRow = {
    id: "m1",
    workspace_id: "w1",
    auth_user_id: null,
    name: "Nick",
    color: "#aabbcc",
    pin_hash: null,
  };

  it("defaults to 90 / 15 / 5 when the columns are absent", () => {
    const m = mapMember(memberRow);
    expect(m.sleepCycleLengthMin).toBe(90);
    expect(m.sleepOnsetLatencyMin).toBe(15);
    expect(m.targetSleepCycles).toBe(5);
  });

  it("passes stored values through", () => {
    const m = mapMember({
      ...memberRow,
      sleep_cycle_length_min: 100,
      sleep_onset_latency_min: 10,
      target_sleep_cycles: 6,
    });
    expect(m.sleepCycleLengthMin).toBe(100);
    expect(m.sleepOnsetLatencyMin).toBe(10);
    expect(m.targetSleepCycles).toBe(6);
  });
});
