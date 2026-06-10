import { describe, expect, it } from "vitest";

import {
  attributeCoverage,
  computeSuggestions,
  type SuggestionsInput,
} from "@/lib/insights/suggestions";
import type { Occurrence, TaskRow, TimeWindow } from "@/lib/types";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
/** Monday 2026-06-01 00:00 UTC. */
const T0 = Date.UTC(2026, 5, 1);
const UTC = "UTC";
const BERLIN = "Europe/Berlin";

let seq = 0;

function occ(over: Partial<Occurrence> = {}): Occurrence {
  seq += 1;
  return {
    key: `k${seq}`,
    eventId: `e${seq}`,
    occurrenceDate: over.start ?? T0,
    start: T0,
    end: T0 + HOUR,
    allDay: false,
    inactive: false,
    status: "confirmed",
    title: "Event",
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

function task(over: Partial<TaskRow> = {}): TaskRow {
  seq += 1;
  return {
    id: `t${seq}`,
    workspaceId: "w1",
    ownerId: "m1",
    assigneeId: null,
    parentId: null,
    boardId: null,
    categoryId: null,
    title: "Task",
    description: null,
    isPrivate: false,
    color: null,
    status: "todo",
    priority: 3,
    dueDate: null,
    position: 0,
    sequential: false,
    completedAt: null,
    attributes: {},
    createdAt: T0,
    updatedAt: T0,
    ...over,
  };
}

function daysOf(win: TimeWindow): number[] {
  const out: number[] = [];
  for (let d = win.start; d < win.end; d += DAY) out.push(d);
  return out;
}

/** Current week Jun 1–7, prev week May 25–31, UTC, "now" mid-week. */
function makeInput(over: Partial<SuggestionsInput> = {}): SuggestionsInput {
  const window: TimeWindow = { start: T0, end: T0 + 7 * DAY };
  const prevWindow: TimeWindow = { start: T0 - 7 * DAY, end: T0 };
  return {
    occurrences: [],
    prevOccurrences: [],
    tasks: [],
    window,
    prevWindow,
    days: daysOf(window),
    prevDays: daysOf(prevWindow),
    timeZone: UTC,
    now: T0 + 3 * DAY + HOUR,
    categoryName: (id) => id ?? "Uncategorized",
    ...over,
  };
}

/** `hours` of tracked time on the day starting at `dayMs` (from 09:00). */
function dayLoad(dayMs: number, hours: number, over: Partial<Occurrence> = {}): Occurrence {
  return occ({ start: dayMs + 9 * HOUR, end: dayMs + (9 + hours) * HOUR, ...over });
}

const prevBaseline4h = (input: SuggestionsInput): Occurrence[] =>
  input.prevDays.slice(0, 5).map((d) => dayLoad(d, 4));

describe("computeSuggestions — empty input", () => {
  it("returns no suggestions", () => {
    expect(computeSuggestions(makeInput())).toEqual([]);
  });
});

describe("rule: overloaded-day", () => {
  it("flags a day clearly above 1.5× the median day (6h floor)", () => {
    const input = makeInput();
    input.prevOccurrences = prevBaseline4h(input);
    input.occurrences = [dayLoad(input.days[2], 7)];
    const out = computeSuggestions(input);
    const ids = out.map((s) => s.id);
    expect(ids).toContain("overloaded-day:2026-06-03");
  });

  it("does not flag a day at exactly the 6h floor, nor typical days", () => {
    const input = makeInput();
    input.prevOccurrences = prevBaseline4h(input);
    input.occurrences = [dayLoad(input.days[2], 6), dayLoad(input.days[3], 4)];
    const out = computeSuggestions(input).filter((s) => s.kind === "overloaded-day");
    expect(out).toEqual([]);
  });

  it("uses an 8h fallback for sparse data (under 5 nonzero days)", () => {
    const input = makeInput();
    input.occurrences = [dayLoad(input.days[1], 7), dayLoad(input.days[2], 9)];
    const out = computeSuggestions(input).filter((s) => s.kind === "overloaded-day");
    expect(out.map((s) => s.id)).toEqual(["overloaded-day:2026-06-03"]);
  });

  it("caps at 3 (heaviest days win) and escalates ≥10h to attention", () => {
    const input = makeInput();
    input.prevOccurrences = input.prevDays.slice(0, 5).map((d) => dayLoad(d, 2));
    input.occurrences = [
      dayLoad(input.days[0], 7),
      dayLoad(input.days[1], 8),
      dayLoad(input.days[2], 9),
      dayLoad(input.days[3], 11),
    ];
    const out = computeSuggestions(input).filter((s) => s.kind === "overloaded-day");
    expect(out).toHaveLength(3);
    const ids = out.map((s) => s.id);
    expect(ids).toContain("overloaded-day:2026-06-04"); // 11h
    expect(ids).toContain("overloaded-day:2026-06-03"); // 9h
    expect(ids).toContain("overloaded-day:2026-06-02"); // 8h
    expect(ids).not.toContain("overloaded-day:2026-06-01"); // 7h dropped by cap
    expect(out.find((s) => s.id === "overloaded-day:2026-06-04")?.severity).toBe("attention");
    expect(out.find((s) => s.id === "overloaded-day:2026-06-03")?.severity).toBe("info");
  });
});

describe("rule: fragmentation", () => {
  /** `n` separate 1h blocks (9–10am) on consecutive days, optionally short (20m). */
  function blocks(days: number[], n: number, shortCount = 0): Occurrence[] {
    const out: Occurrence[] = [];
    for (let i = 0; i < n; i++) {
      const day = days[i % days.length];
      const offset = Math.floor(i / days.length) * 3 * HOUR; // separate merged blocks
      const start = day + 9 * HOUR + offset;
      const lenMs = i < shortCount ? 20 * 60_000 : HOUR;
      out.push(occ({ start, end: start + lenMs }));
    }
    return out;
  }

  it("fires on a clear short-block share regression", () => {
    const input = makeInput();
    input.prevOccurrences = blocks(input.prevDays, 10);
    input.occurrences = blocks(input.days, 10, 4); // share 0 → 0.4
    const out = computeSuggestions(input).filter((s) => s.kind === "fragmentation");
    expect(out.map((s) => s.id)).toEqual(["fragmentation:regression"]);
    expect(out[0].severity).toBe("info");
  });

  it("stays silent below the 0.15 share threshold and 25% avg-block drop", () => {
    const input = makeInput();
    input.prevOccurrences = blocks(input.prevDays, 10);
    input.occurrences = blocks(input.days, 10, 1); // share 0.1, avg 56.5m > 45m
    expect(computeSuggestions(input).filter((s) => s.kind === "fragmentation")).toEqual([]);
  });

  it("needs at least 5 blocks in both windows", () => {
    const input = makeInput();
    input.prevOccurrences = blocks(input.prevDays, 10);
    input.occurrences = blocks(input.days, 4, 4); // heavy regression but tiny sample
    expect(computeSuggestions(input).filter((s) => s.kind === "fragmentation")).toEqual([]);
  });
});

describe("rule: late-night", () => {
  it("fires when a ≥23:00 end is followed by a 4–8am start less than 8h later", () => {
    const input = makeInput();
    input.occurrences = [
      occ({ start: input.days[0] + 22 * HOUR, end: input.days[0] + 23.5 * HOUR }),
      occ({ start: input.days[1] + 7 * HOUR, end: input.days[1] + 8 * HOUR }),
    ];
    const out = computeSuggestions(input).filter((s) => s.kind === "late-night");
    expect(out.map((s) => s.id)).toEqual(["late-night:2026-06-02"]);
  });

  it("counts an after-midnight end (before 4am) against the same morning", () => {
    const input = makeInput();
    input.occurrences = [
      occ({ start: input.days[0] + 23 * HOUR, end: input.days[1] + 1.5 * HOUR }),
      occ({ start: input.days[1] + 7 * HOUR, end: input.days[1] + 8 * HOUR }),
    ];
    const out = computeSuggestions(input).filter((s) => s.kind === "late-night");
    expect(out.map((s) => s.id)).toEqual(["late-night:2026-06-02"]);
  });

  it("does not fire for earlier ends, later starts, or a full 8h gap", () => {
    const input = makeInput();
    input.occurrences = [
      // ends 22:50 — not late
      occ({ start: input.days[0] + 22 * HOUR, end: input.days[0] + 22 * HOUR + 50 * 60_000 }),
      occ({ start: input.days[1] + 7 * HOUR, end: input.days[1] + 8 * HOUR }),
      // late end day 3, but start at 8:00 is outside [4,8)
      occ({ start: input.days[2] + 22 * HOUR, end: input.days[2] + 23.5 * HOUR }),
      occ({ start: input.days[3] + 8 * HOUR, end: input.days[3] + 9 * HOUR }),
      // late end 23:00 day 5 with 07:30 start = 8.5h gap
      occ({ start: input.days[4] + 22 * HOUR, end: input.days[4] + 23 * HOUR }),
      occ({ start: input.days[5] + 7.5 * HOUR, end: input.days[5] + 8 * HOUR }),
    ];
    expect(computeSuggestions(input).filter((s) => s.kind === "late-night")).toEqual([]);
  });

  it("ignores inactive (sleep) occurrences entirely", () => {
    const input = makeInput();
    input.occurrences = [
      occ({ start: input.days[0] + 22 * HOUR, end: input.days[0] + 23.5 * HOUR, inactive: true }),
      occ({ start: input.days[1] + 7 * HOUR, end: input.days[1] + 8 * HOUR }),
    ];
    expect(computeSuggestions(input).filter((s) => s.kind === "late-night")).toEqual([]);
  });

  it("judges the rest gap in real elapsed time across the Berlin spring-forward night", () => {
    // Sun 2026-03-29 Berlin: clocks jump 02:00 → 03:00, the night is 1h shorter.
    // 23:30 wall end → 07:00 wall start looks like 7.5h but is really 6.5h.
    const satMidnight = Date.UTC(2026, 2, 27, 23); // Sat 2026-03-28 00:00 Berlin (UTC+1)
    const window: TimeWindow = { start: satMidnight, end: satMidnight + 2 * DAY - HOUR };
    const days = [satMidnight, satMidnight + DAY]; // Sunday is 23h long
    const input = makeInput({ window, days, timeZone: BERLIN, now: satMidnight + HOUR });
    input.occurrences = [
      occ({ start: satMidnight + 22 * HOUR, end: satMidnight + 23.5 * HOUR }), // Sat 23:30
      occ({ start: Date.UTC(2026, 2, 29, 5), end: Date.UTC(2026, 2, 29, 6) }), // Sun 07:00 wall (UTC+2)
    ];
    const out = computeSuggestions(input).filter((s) => s.kind === "late-night");
    expect(out.map((s) => s.id)).toEqual(["late-night:2026-03-29"]);
  });
});

describe("rule: category-drift", () => {
  it("flags the single biggest share shift vs the previous period", () => {
    const input = makeInput();
    // prev: A 6h, B 2h, C 2h (shares .6/.2/.2)
    input.prevOccurrences = [
      dayLoad(input.prevDays[0], 6, { categoryId: "catA" }),
      dayLoad(input.prevDays[1], 2, { categoryId: "catB" }),
      dayLoad(input.prevDays[2], 2, { categoryId: "catC" }),
    ];
    // cur: A 3h, B 3.5h, C 3.5h (shares .3/.35/.35) → A shifted -0.3
    input.occurrences = [
      dayLoad(input.days[0], 3, { categoryId: "catA" }),
      dayLoad(input.days[1], 3.5, { categoryId: "catB" }),
      dayLoad(input.days[2], 3.5, { categoryId: "catC" }),
    ];
    const out = computeSuggestions(input).filter((s) => s.kind === "category-drift");
    expect(out.map((s) => s.id)).toEqual(["category-drift:catA"]);
    expect(out[0].body).toContain("catA"); // via the categoryName resolver
  });

  it("stays silent when either window has under 8h tracked", () => {
    const input = makeInput();
    input.prevOccurrences = [
      dayLoad(input.prevDays[0], 3, { categoryId: "catA" }),
      dayLoad(input.prevDays[1], 1, { categoryId: "catB" }),
    ];
    input.occurrences = [
      dayLoad(input.days[0], 1, { categoryId: "catA" }),
      dayLoad(input.days[1], 3, { categoryId: "catB" }),
    ];
    expect(computeSuggestions(input).filter((s) => s.kind === "category-drift")).toEqual([]);
  });

  it("ignores categories that never reach 3h in either window", () => {
    const input = makeInput();
    // C: 0.5h → 2.5h is a +0.2 share shift but stays under 3h; A/B shift only -0.1 each.
    input.prevOccurrences = [
      dayLoad(input.prevDays[0], 5, { categoryId: "catA" }),
      dayLoad(input.prevDays[1], 4.5, { categoryId: "catB" }),
      dayLoad(input.prevDays[2], 0.5, { categoryId: "catC" }),
    ];
    input.occurrences = [
      dayLoad(input.days[0], 4, { categoryId: "catA" }),
      dayLoad(input.days[1], 3.5, { categoryId: "catB" }),
      dayLoad(input.days[2], 2.5, { categoryId: "catC" }),
    ];
    expect(computeSuggestions(input).filter((s) => s.kind === "category-drift")).toEqual([]);
  });
});

describe("rule: unscheduled-task", () => {
  const dueSoon = "2026-06-06"; // 2 full days past "now" (Jun 4 01:00)

  it("fires for an open P3 task due within 7 days with no upcoming block", () => {
    const input = makeInput();
    const t = task({ id: "t-hot", dueDate: dueSoon });
    input.tasks = [t];
    const out = computeSuggestions(input).filter((s) => s.kind === "unscheduled-task");
    expect(out.map((s) => s.id)).toEqual(["unscheduled-task:t-hot"]);
  });

  it("an upcoming scheduled block suppresses it; a past block does not", () => {
    const input = makeInput();
    input.tasks = [task({ id: "t-hot", dueDate: dueSoon })];
    input.occurrences = [
      occ({ taskId: "t-hot", start: input.now - 3 * HOUR, end: input.now - 2 * HOUR }),
    ];
    expect(
      computeSuggestions(input).filter((s) => s.kind === "unscheduled-task"),
    ).toHaveLength(1);

    input.occurrences.push(
      occ({ taskId: "t-hot", start: input.now + HOUR, end: input.now + 2 * HOUR }),
    );
    expect(
      computeSuggestions(input).filter((s) => s.kind === "unscheduled-task"),
    ).toEqual([]);
  });

  it("excludes done/low-priority/overdue/subtask/far-future candidates", () => {
    const input = makeInput();
    input.tasks = [
      task({ dueDate: dueSoon, status: "done", completedAt: input.now }),
      task({ dueDate: dueSoon, priority: 2 }),
      task({ dueDate: "2026-06-03" }), // overdue (before "now" Jun 4)
      task({ dueDate: dueSoon, parentId: "parent" }),
      task({ dueDate: "2026-06-20" }), // beyond 7 days
    ];
    expect(computeSuggestions(input).filter((s) => s.kind === "unscheduled-task")).toEqual([]);
  });

  it("is suppressed entirely for fully past periods", () => {
    const input = makeInput({ now: T0 + 30 * DAY });
    input.tasks = [task({ dueDate: "2026-07-02" })];
    expect(computeSuggestions(input).filter((s) => s.kind === "unscheduled-task")).toEqual([]);
  });

  it("caps at 2 by due date and escalates ≤2-day deadlines to attention", () => {
    const input = makeInput();
    input.tasks = [
      task({ id: "t-c", dueDate: "2026-06-08" }),
      task({ id: "t-a", dueDate: "2026-06-04" }), // due today (now = Jun 4 01:00)
      task({ id: "t-b", dueDate: "2026-06-07" }),
    ];
    const out = computeSuggestions(input).filter((s) => s.kind === "unscheduled-task");
    expect(out.map((s) => s.id)).toEqual(["unscheduled-task:t-a", "unscheduled-task:t-b"]);
    expect(out[0].severity).toBe("attention");
    expect(out[1].severity).toBe("info");
  });
});

describe("rule: stranded-flexible", () => {
  it("suggests moving movable items off an overloaded day", () => {
    const input = makeInput();
    input.prevOccurrences = prevBaseline4h(input);
    input.occurrences = [
      dayLoad(input.days[2], 5),
      dayLoad(input.days[2], 3, {
        start: input.days[2] + 15 * HOUR,
        end: input.days[2] + 18 * HOUR,
        title: "Gym",
        attributes: { flexibility: "movable" },
      }),
    ];
    const out = computeSuggestions(input).filter((s) => s.kind === "stranded-flexible");
    expect(out.map((s) => s.id)).toEqual(["stranded-flexible:2026-06-03"]);
    expect(out[0].body).toContain("Gym");
  });

  it("stays silent when nothing on the heavy day is movable", () => {
    const input = makeInput();
    input.prevOccurrences = prevBaseline4h(input);
    input.occurrences = [dayLoad(input.days[2], 8)];
    expect(computeSuggestions(input).filter((s) => s.kind === "stranded-flexible")).toEqual([]);
  });
});

describe("ordering and caps", () => {
  it("orders attention before info, then by kind priority; caps the total at 6", () => {
    const input = makeInput();
    input.prevOccurrences = [
      ...prevBaseline4h(input),
      ...input.prevDays.map((d, i) =>
        occ({ start: d + 20 * HOUR, end: d + 21 * HOUR, categoryId: i < 4 ? "catA" : "catB" }),
      ),
    ];
    input.occurrences = [
      // three overloaded days (one attention-grade)
      dayLoad(input.days[0], 11),
      dayLoad(input.days[1], 8, { attributes: { flexibility: "flexible" }, title: "Stretch" }),
      dayLoad(input.days[2], 7),
      // late night into day 4
      occ({ start: input.days[2] + 22 * HOUR, end: input.days[2] + 23.5 * HOUR }),
      occ({ start: input.days[3] + 5 * HOUR, end: input.days[3] + 6 * HOUR }),
      // drift: catB takes over
      dayLoad(input.days[4], 6, { categoryId: "catB" }),
    ];
    input.tasks = [task({ id: "t-due", dueDate: "2026-06-04" })]; // attention
    const out = computeSuggestions(input);

    expect(out.length).toBeLessThanOrEqual(6);
    // attention block first
    const severities = out.map((s) => s.severity);
    const firstInfo = severities.indexOf("info");
    expect(severities.slice(0, firstInfo)).not.toContain("info");
    expect(severities.slice(firstInfo)).not.toContain("attention");
    // within attention, task beats overloaded-day (kind priority)
    expect(out[0].id).toBe("unscheduled-task:t-due");
    expect(out[1].kind).toBe("overloaded-day");
  });

  it("is deterministic — two identical calls give identical ids", () => {
    const input = makeInput();
    input.prevOccurrences = prevBaseline4h(input);
    input.occurrences = [dayLoad(input.days[2], 7)];
    input.tasks = [task({ id: "t-x", dueDate: "2026-06-05" })];
    expect(computeSuggestions(input).map((s) => s.id)).toEqual(
      computeSuggestions(input).map((s) => s.id),
    );
  });
});

describe("attributeCoverage", () => {
  it("computes the share of (non-inactive, event-kind) occurrences with any known attribute", () => {
    const occs = [
      occ({ attributes: { energy: 2 } }),
      occ({}),
      occ({}),
      occ({}),
      occ({ inactive: true }), // excluded from the denominator
      occ({ attributes: { mood: "calm" } as Occurrence["attributes"] }), // unknown-only: not covered
    ];
    const c = attributeCoverage(occs);
    expect(c.tracked).toBe(5);
    expect(c.withAttributes).toBe(1);
    expect(c.share).toBeCloseTo(0.2);
  });

  it("returns a null share when empty", () => {
    expect(attributeCoverage([]).share).toBeNull();
  });
});
