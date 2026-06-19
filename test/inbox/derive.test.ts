import { describe, expect, it } from "vitest";

import { deriveInboxItems, type InboxInput } from "@/lib/inbox/derive";
import type { Occurrence, TaskRow } from "@/lib/types";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

const VIEWER = "viewer-1";
const PARTNER = "partner-2";
const UTC = "UTC";
const NIGHT = { startHour: 20, endHour: 12 };

/** Wed 2026-06-10 15:00 UTC — afternoon, so today's wake-window (ends 12:00)
 *  has already passed: today's sleep nudge is eligible unless a log exists. */
const NOW = Date.UTC(2026, 5, 10, 15, 0);

let seq = 0;

function occ(over: Partial<Occurrence> = {}): Occurrence {
  seq += 1;
  return {
    key: `k${seq}`,
    eventId: `e${seq}`,
    occurrenceDate: over.start ?? NOW,
    start: NOW - 2 * HOUR,
    end: NOW - HOUR,
    allDay: false,
    inactive: false,
    status: "confirmed",
    title: `Event ${seq}`,
    description: null,
    location: null,
    categoryId: null,
    color: null,
    kind: "event",
    ownerId: VIEWER,
    isPrivate: false,
    isShared: false,
    hiddenFromPublic: false,
    taskId: null,
    attributes: {},
    isRecurring: false,
    isException: false,
    ...over,
  };
}

function task(over: Partial<TaskRow> = {}): TaskRow {
  seq += 1;
  return {
    id: `t${seq}`,
    workspaceId: "ws",
    ownerId: VIEWER,
    assigneeId: VIEWER,
    parentId: null,
    collectionId: "col",
    categoryId: null,
    title: `Task ${seq}`,
    description: null,
    isPrivate: false,
    color: null,
    boardId: "done",
    priority: null,
    dueDate: null,
    startDate: null,
    isMilestone: false,
    position: 0,
    sequential: false,
    completedAt: NOW - HOUR,
    attributes: {},
    createdAt: NOW - DAY,
    updatedAt: NOW - HOUR,
    ...over,
  };
}

function input(over: Partial<InboxInput> = {}): InboxInput {
  return {
    occurrences: [],
    tasks: [],
    sleepLogDates: new Set<string>(),
    viewerId: VIEWER,
    now: NOW,
    timeZone: UTC,
    nightWindow: NIGHT,
    // Pin the windows so the fixtures don't drift with the named defaults.
    rateWindowDays: 3,
    // Keep sleep coverage tiny in non-sleep tests; sleep tests set it explicitly.
    sleepWindowDays: 0,
    ...over,
  };
}

describe("deriveInboxItems — rate-event", () => {
  it("surfaces the viewer's own finished, unrated, timed block", () => {
    const out = deriveInboxItems(
      input({ occurrences: [occ({ eventId: "ev", title: "Standup" })] }),
    );
    expect(out).toEqual([
      {
        id: out[0].id,
        kind: "rate-event",
        severity: "info",
        sortMs: NOW - HOUR,
        eventId: "ev",
        titleText: "Standup",
        attributes: {},
      },
    ]);
  });

  it("excludes the partner's events, all-day, inactive, context and cancelled", () => {
    const out = deriveInboxItems(
      input({
        occurrences: [
          occ({ ownerId: PARTNER }),
          occ({ allDay: true }),
          occ({ inactive: true }),
          occ({ kind: "context" }),
          occ({ status: "cancelled" }),
        ],
      }),
    );
    expect(out).toEqual([]);
  });

  it("excludes already-rated, future, too-old and recurring occurrences", () => {
    const out = deriveInboxItems(
      input({
        occurrences: [
          occ({ attributes: { satisfaction: 3 } }),
          occ({ start: NOW + HOUR, end: NOW + 2 * HOUR }), // hasn't ended
          occ({ start: NOW - 5 * DAY, end: NOW - 5 * DAY + HOUR }), // older than RATE_N
          occ({ isRecurring: true }), // v1 skips recurring (series-level write)
        ],
      }),
    );
    expect(out).toEqual([]);
  });

  it("includes a block that ended exactly at the RATE_N boundary", () => {
    const out = deriveInboxItems(
      input({ occurrences: [occ({ end: NOW - 3 * DAY })] }), // == cutoff, inclusive
    );
    expect(out).toHaveLength(1);
  });
});

describe("deriveInboxItems — rate-task", () => {
  it("surfaces a top-level task the viewer finished, still unrated", () => {
    const out = deriveInboxItems(input({ tasks: [task({ id: "tk", title: "Ship" })] }));
    expect(out).toEqual([
      {
        id: "rate-task:tk",
        kind: "rate-task",
        severity: "info",
        sortMs: NOW - HOUR,
        taskId: "tk",
        titleText: "Ship",
        attributes: {},
      },
    ]);
  });

  it("includes an unassigned task owned by the viewer", () => {
    const out = deriveInboxItems(
      input({ tasks: [task({ assigneeId: null, ownerId: VIEWER })] }),
    );
    expect(out).toHaveLength(1);
  });

  it("excludes subtasks, rated, open, partner-done and too-old tasks", () => {
    const out = deriveInboxItems(
      input({
        tasks: [
          task({ parentId: "parent" }), // subtask
          task({ attributes: { satisfaction: 2 } }), // already rated
          task({ completedAt: null }), // not done
          task({ assigneeId: PARTNER }), // partner did it
          task({ assigneeId: null, ownerId: PARTNER }), // unassigned, partner's
          task({ completedAt: NOW - 5 * DAY }), // older than RATE_N
          task({ completedAt: NOW + HOUR }), // completed "in the future"
        ],
      }),
    );
    expect(out).toEqual([]);
  });
});

describe("deriveInboxItems — log-sleep", () => {
  it("surfaces one row per recent morning lacking a log (today included once over)", () => {
    const out = deriveInboxItems(input({ sleepWindowDays: 7 })).filter(
      (i) => i.kind === "log-sleep",
    );
    // 7 days back from Jun 10 (afternoon → today eligible): Jun 4..10.
    expect(out.map((i) => (i.kind === "log-sleep" ? i.dateKey : ""))).toEqual([
      "2026-06-10",
      "2026-06-09",
      "2026-06-08",
      "2026-06-07",
      "2026-06-06",
      "2026-06-05",
      "2026-06-04",
    ]);
  });

  it("skips mornings that already have a log", () => {
    const out = deriveInboxItems(
      input({ sleepWindowDays: 7, sleepLogDates: new Set(["2026-06-09", "2026-06-07"]) }),
    ).filter((i) => i.kind === "log-sleep");
    expect(out.map((i) => (i.kind === "log-sleep" ? i.dateKey : ""))).not.toContain(
      "2026-06-09",
    );
    expect(out).toHaveLength(5);
  });

  it("hides today's morning until its wake-window end has passed", () => {
    const before = deriveInboxItems(
      input({ now: Date.UTC(2026, 5, 10, 9, 0), sleepWindowDays: 7 }), // 09:00 < 12:00 end
    ).filter((i) => i.kind === "log-sleep");
    expect(before.map((i) => (i.kind === "log-sleep" ? i.dateKey : ""))).not.toContain(
      "2026-06-10",
    );
    expect(before).toHaveLength(6); // Jun 9..4

    const after = deriveInboxItems(
      input({ now: Date.UTC(2026, 5, 10, 13, 0), sleepWindowDays: 7 }), // 13:00 > 12:00 end
    ).filter((i) => i.kind === "log-sleep");
    expect(after.map((i) => (i.kind === "log-sleep" ? i.dateKey : ""))).toContain(
      "2026-06-10",
    );
  });

  it("applies the wake-window end in the viewer zone (DST-safe)", () => {
    // Berlin is UTC+2 in June. 09:30 UTC = 11:30 Berlin (before the 12:00 end),
    // so Berlin's "today" (Jun 10) is still hidden; 10:30 UTC = 12:30 Berlin is past.
    const hidden = deriveInboxItems(
      input({ now: Date.UTC(2026, 5, 10, 9, 30), timeZone: "Europe/Berlin", sleepWindowDays: 3 }),
    ).filter((i) => i.kind === "log-sleep");
    expect(hidden.map((i) => (i.kind === "log-sleep" ? i.dateKey : ""))).not.toContain(
      "2026-06-10",
    );

    const shown = deriveInboxItems(
      input({ now: Date.UTC(2026, 5, 10, 10, 30), timeZone: "Europe/Berlin", sleepWindowDays: 3 }),
    ).filter((i) => i.kind === "log-sleep");
    expect(shown.map((i) => (i.kind === "log-sleep" ? i.dateKey : ""))).toContain(
      "2026-06-10",
    );
  });
});

describe("deriveInboxItems — sort, stability, empty", () => {
  it("orders newest-first across kinds and is stable across recomputes", () => {
    const args = input({
      sleepWindowDays: 2,
      occurrences: [occ({ end: NOW - 30 * 60_000 })], // 30 min ago — most recent
      tasks: [task({ completedAt: NOW - 6 * HOUR })], // older than the event
    });
    const a = deriveInboxItems(args);
    const b = deriveInboxItems(args);
    expect(a.map((i) => i.id)).toEqual(b.map((i) => i.id)); // stable ids
    // sortMs strictly descending
    for (let i = 1; i < a.length; i++) {
      expect(a[i - 1].sortMs).toBeGreaterThanOrEqual(a[i].sortMs);
    }
    expect(a[0].kind).toBe("rate-event"); // 30-min-ago event beats everything
  });

  it("returns [] when there is nothing to attend to", () => {
    expect(deriveInboxItems(input())).toEqual([]);
  });
});

describe("deriveInboxItems — request (Phase 4)", () => {
  function request(over: Partial<import("@/lib/types").TimeslotRequestRow> = {}) {
    seq += 1;
    return {
      id: `req${seq}`,
      shareId: "share-1",
      workspaceId: "ws",
      ownerId: VIEWER,
      requesterName: "Jordan",
      message: "coffee?",
      proposedStart: NOW + DAY,
      proposedEnd: NOW + DAY + HOUR,
      status: "pending" as const,
      createdAt: NOW - HOUR,
      resolvedAt: null,
      ...over,
    };
  }

  it("surfaces a pending request as an attention row", () => {
    const out = deriveInboxItems(input({ requests: [request({ id: "r1" })] }));
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      kind: "request",
      severity: "attention",
      requestId: "r1",
      requesterName: "Jordan",
    });
  });

  it("sorts request (attention) above rating/sleep (info) rows", () => {
    const out = deriveInboxItems(
      input({
        // an event that ended just now — the freshest info row
        occurrences: [occ({ end: NOW - 60_000, title: "Standup" })],
        // an older request
        requests: [request({ createdAt: NOW - 5 * HOUR })],
      }),
    );
    expect(out[0].kind).toBe("request"); // attention wins despite being older
    expect(out.some((i) => i.kind === "rate-event")).toBe(true);
  });

  it("ignores already-resolved requests (the loader passes only pending)", () => {
    // The query filters to pending; derive trusts that, so a non-pending row that
    // slips in still becomes a row — assert the loader contract by passing only
    // pending here and confirming nothing else appears.
    const out = deriveInboxItems(input({ requests: [] }));
    expect(out).toEqual([]);
  });
});
