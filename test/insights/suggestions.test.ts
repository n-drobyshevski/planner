import { describe, expect, it } from "vitest";
import { createTranslator } from "next-intl";
import { TZDate } from "@date-fns/tz";

import {
  attributeCoverage,
  computeSuggestions,
  type SuggestionsInput,
} from "@/lib/insights/suggestions";
import enInsights from "@/messages/en/insights.json";
import type { Occurrence, TaskRow, TimeWindow } from "@/lib/types";

// A real English translator over the actual `insights` catalog, so these tests
// exercise the same ICU messages the app renders (suggestions copy now lives in
// messages/en/insights.json under "suggestions" rather than inline strings).
const t = createTranslator({
  locale: "en",
  messages: { insights: enInsights },
  namespace: "insights",
}) as (key: string, values?: Record<string, string | number>) => string;

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
    collectionId: null,
    categoryId: null,
    title: "Task",
    description: null,
    isPrivate: false,
    color: null,
    boardId: null,
    priority: 3,
    dueDate: null,
    startDate: null,
    isMilestone: false,
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
    t,
    locale: "en",
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
      task({ dueDate: dueSoon, completedAt: input.now }),
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
  // `now` is mid-window (Jun 4); days[4] (Jun 5) is a future, still-reschedulable day.
  it("suggests moving movable items off an overloaded future day", () => {
    const input = makeInput();
    input.prevOccurrences = prevBaseline4h(input);
    input.occurrences = [
      dayLoad(input.days[4], 5),
      dayLoad(input.days[4], 3, {
        start: input.days[4] + 15 * HOUR,
        end: input.days[4] + 18 * HOUR,
        title: "Gym",
        attributes: { flexibility: "movable" },
      }),
    ];
    const out = computeSuggestions(input).filter((s) => s.kind === "stranded-flexible");
    expect(out.map((s) => s.id)).toEqual(["stranded-flexible:2026-06-05"]);
    expect(out[0].body).toContain("Gym");
    // The "freer day" it names must be today-or-future, never a past day.
    expect(out[0].dayMs).toBeGreaterThanOrEqual(input.days[3]);
  });

  it("stays silent when the only overloaded movable day is in the past", () => {
    const input = makeInput();
    input.prevOccurrences = prevBaseline4h(input);
    // days[2] (Jun 3) is before "today" (Jun 4) — you cannot reschedule the past.
    input.occurrences = [
      dayLoad(input.days[2], 5),
      dayLoad(input.days[2], 3, {
        start: input.days[2] + 15 * HOUR,
        end: input.days[2] + 18 * HOUR,
        title: "Gym",
        attributes: { flexibility: "movable" },
      }),
    ];
    expect(computeSuggestions(input).filter((s) => s.kind === "stranded-flexible")).toEqual([]);
  });

  it("stays silent when nothing on the heavy day is movable", () => {
    const input = makeInput();
    input.prevOccurrences = prevBaseline4h(input);
    input.occurrences = [dayLoad(input.days[4], 8)];
    expect(computeSuggestions(input).filter((s) => s.kind === "stranded-flexible")).toEqual([]);
  });
});

describe("ordering and caps", () => {
  it("orders attention before info, then by kind priority; caps the total at 8", () => {
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

    expect(out.length).toBeLessThanOrEqual(8);
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

  it("sinks past-day cards below equal-severity today/future cards (but keeps them)", () => {
    const input = makeInput();
    input.prevOccurrences = prevBaseline4h(input);
    // Two info-grade heavy days: one in the past (Jun 2), one in the future (Jun 6).
    input.occurrences = [dayLoad(input.days[1], 7), dayLoad(input.days[5], 7)];
    const ids = computeSuggestions(input)
      .filter((s) => s.kind === "overloaded-day")
      .map((s) => s.id);
    // Both reflections are still emitted, but the future day ranks first.
    expect(ids).toEqual(["overloaded-day:2026-06-06", "overloaded-day:2026-06-02"]);
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

// --- Advice v2: evidence, actions, and the new optional-input rules ---------

import { goalProgress } from "@/lib/insights/goals";
import type { CategoryGoal } from "@/lib/types";
import type { Forecast } from "@/lib/analytics/forecast";
import type { SleepDayPair } from "@/lib/analytics/sleep-cross";

function goalRow(over: Partial<CategoryGoal> = {}): CategoryGoal {
  return {
    id: "g1",
    workspaceId: "w1",
    categoryId: "catA",
    weeklyTargetMs: 7 * HOUR,
    direction: "at-least",
    createdBy: "m1",
    createdAt: T0,
    ...over,
  };
}

function forecastOf(over: Partial<Forecast> = {}): Forecast {
  return {
    perDay: [{ dayMs: T0 + 7 * DAY, committedMs: 6 * HOUR }],
    busiestDay: { dayMs: T0 + 7 * DAY, ms: 6 * HOUR },
    typicalDayMs: 4 * HOUR,
    capacityRatio: 1.2,
    dueUnscheduled: [],
    ...over,
  };
}

function night(wakeDayMs: number, durationMs: number | null): SleepDayPair {
  return {
    wakeDayMs,
    durationMs,
    quality: null,
    nextDay: { trackedMs: 0, fragmentation: null, meanSatisfaction: null },
  };
}

describe("evidence and actions", () => {
  it("every emitted suggestion carries populated evidence", () => {
    const input = makeInput();
    input.prevOccurrences = prevBaseline4h(input);
    input.occurrences = [dayLoad(input.days[1], 8)];
    input.tasks = [task({ id: "t-e", dueDate: "2026-06-05" })];
    input.goals = [
      goalProgress(
        goalRow({ direction: "at-most", weeklyTargetMs: HOUR }),
        2 * HOUR,
        input.days,
        input.window,
        input.now,
      ),
    ];
    const out = computeSuggestions(input);
    expect(out.length).toBeGreaterThanOrEqual(3);
    for (const s of out) {
      expect(s.evidence.summary.length).toBeGreaterThan(0);
      expect(s.evidence.threshold.length).toBeGreaterThan(0);
      expect(s.evidence.windowLabel.length).toBeGreaterThan(0);
    }
  });

  it("windowLabel prefers periodLabel and falls back to the date range", () => {
    const input = makeInput({ periodLabel: "This week" });
    input.prevOccurrences = prevBaseline4h(input);
    input.occurrences = [dayLoad(input.days[1], 8)];
    expect(computeSuggestions(input)[0].evidence.windowLabel).toBe("This week");

    const fallback = makeInput();
    fallback.prevOccurrences = prevBaseline4h(fallback);
    fallback.occurrences = [dayLoad(fallback.days[1], 8)];
    expect(computeSuggestions(fallback)[0].evidence.windowLabel).toBe("1 Jun – 7 Jun");
  });

  it("deep links are well-formed calendar/tasks/insights hrefs", () => {
    const input = makeInput();
    input.prevOccurrences = prevBaseline4h(input);
    input.occurrences = [dayLoad(input.days[1], 8)];
    input.tasks = [task({ id: "t-a", dueDate: "2026-06-05" })];
    input.forecast = forecastOf();
    const out = computeSuggestions(input);
    const byKind = new Map(out.map((s) => [s.kind, s]));
    expect(byKind.get("overloaded-day")?.action?.href).toBe(
      "/calendar?date=2026-06-02&view=day",
    );
    expect(byKind.get("unscheduled-task")?.action?.href).toBe("/tasks");
    expect(byKind.get("forecast-overload")?.action?.href).toBe(
      "/calendar?date=2026-06-08&view=day",
    );
  });
});

describe("goal rules", () => {
  it("flags a blown at-most budget, escalating ≥1.25× to attention", () => {
    const input = makeInput();
    const mild = goalProgress(
      goalRow({ id: "g-m", categoryId: "catA", direction: "at-most", weeklyTargetMs: 7 * HOUR }),
      7.5 * HOUR,
      input.days,
      input.window,
      input.now,
    );
    const blown = goalProgress(
      goalRow({ id: "g-b", categoryId: "catB", direction: "at-most", weeklyTargetMs: 7 * HOUR }),
      10 * HOUR,
      input.days,
      input.window,
      input.now,
    );
    input.goals = [mild, blown];
    const out = computeSuggestions(input).filter((s) => s.kind === "goal-over-budget");
    expect(out.map((s) => s.id).sort()).toEqual([
      "goal-over-budget:catA",
      "goal-over-budget:catB",
    ]);
    expect(out.find((s) => s.id.endsWith("catB"))?.severity).toBe("attention");
    expect(out.find((s) => s.id.endsWith("catA"))?.severity).toBe("info");
  });

  it("flags behind-pace at-least targets mid-window only", () => {
    const input = makeInput(); // now = day 3+1h → expected ≈ 43%
    const behind = goalProgress(
      goalRow(),
      0,
      input.days,
      input.window,
      input.now,
    );
    input.goals = [behind];
    expect(
      computeSuggestions(input).some((s) => s.kind === "goal-under-budget"),
    ).toBe(true);

    // Fully-past window: expected is null → silent (the bullets tell it).
    const past = makeInput({ now: T0 + 30 * DAY });
    past.goals = [goalProgress(goalRow(), 0, past.days, past.window, past.now)];
    expect(
      computeSuggestions(past).some((s) => s.kind === "goal-under-budget"),
    ).toBe(false);
  });

  it("stays silent for on-track and met goals", () => {
    const input = makeInput();
    input.goals = [
      goalProgress(goalRow(), 7 * HOUR, input.days, input.window, input.now), // met
      goalProgress(
        goalRow({ id: "g2", categoryId: "catB", direction: "at-most" }),
        HOUR,
        input.days,
        input.window,
        input.now,
      ), // under cap
    ];
    const kinds = computeSuggestions(input).map((s) => s.kind);
    expect(kinds).not.toContain("goal-over-budget");
    expect(kinds).not.toContain("goal-under-budget");
  });
});

describe("forecast-overload rule", () => {
  it("fires above 110% of typical pace and escalates above 130%", () => {
    const input = makeInput({ forecast: forecastOf({ capacityRatio: 1.2 }) });
    const mild = computeSuggestions(input).find((s) => s.kind === "forecast-overload");
    expect(mild?.severity).toBe("info");

    const heavy = makeInput({ forecast: forecastOf({ capacityRatio: 1.4 }) });
    expect(
      computeSuggestions(heavy).find((s) => s.kind === "forecast-overload")?.severity,
    ).toBe("attention");
  });

  it("stays silent under the threshold, without a baseline, and for past periods", () => {
    const under = makeInput({ forecast: forecastOf({ capacityRatio: 1.05 }) });
    expect(
      computeSuggestions(under).some((s) => s.kind === "forecast-overload"),
    ).toBe(false);

    const noBaseline = makeInput({ forecast: forecastOf({ capacityRatio: null }) });
    expect(
      computeSuggestions(noBaseline).some((s) => s.kind === "forecast-overload"),
    ).toBe(false);

    const past = makeInput({
      now: T0 + 30 * DAY,
      forecast: forecastOf({ capacityRatio: 2 }),
    });
    expect(
      computeSuggestions(past).some((s) => s.kind === "forecast-overload"),
    ).toBe(false);
  });
});

describe("anomaly rule", () => {
  it("surfaces anomalies but never re-flags an overloaded day, capping at 2", () => {
    const input = makeInput();
    input.prevOccurrences = prevBaseline4h(input);
    input.occurrences = [dayLoad(input.days[1], 8)]; // overloaded day 2
    input.anomalies = [
      { dayMs: input.days[1], ms: 8 * HOUR, z: 4, direction: "high" }, // duplicate of overload
      { dayMs: input.days[2], ms: 30 * 60_000, z: -3.5, direction: "low" },
      { dayMs: input.days[3], ms: 9 * HOUR, z: 3.2, direction: "high" },
      { dayMs: input.days[4], ms: 9 * HOUR, z: 3.1, direction: "high" },
    ];
    const out = computeSuggestions(input).filter((s) => s.kind === "anomaly");
    expect(out).toHaveLength(2);
    // Both survive the cap; the today-anchored card (Jun 4) sorts above the past one (Jun 3).
    expect(out.map((s) => s.id)).toEqual([
      "anomaly:2026-06-04",
      "anomaly:2026-06-03",
    ]);
  });
});

describe("streak-broken rule", () => {
  it("fires when a 5+ day streak ended, silent otherwise", () => {
    const fired = makeInput({ streak: { current: 0, longest: 6 } });
    expect(computeSuggestions(fired).some((s) => s.kind === "streak-broken")).toBe(true);

    const short = makeInput({ streak: { current: 0, longest: 4 } });
    expect(computeSuggestions(short).some((s) => s.kind === "streak-broken")).toBe(false);

    const alive = makeInput({ streak: { current: 6, longest: 6 } });
    expect(computeSuggestions(alive).some((s) => s.kind === "streak-broken")).toBe(false);
  });
});

describe("sleep-debt rule (viewer-only)", () => {
  it("fires when 3 of the last 7 logged nights are under 7h", () => {
    const input = makeInput({
      sleepPairs: [
        night(T0, 8 * HOUR),
        night(T0 + DAY, 6 * HOUR),
        night(T0 + 2 * DAY, 6.5 * HOUR),
        night(T0 + 3 * DAY, 5 * HOUR),
        night(T0 + 4 * DAY, null), // unlogged duration — excluded
      ],
    });
    const s = computeSuggestions(input).find((x) => x.kind === "sleep-debt");
    expect(s).toBeDefined();
    expect(s?.action?.href).toBe("/insights?tab=sleep");
  });

  it("is silent with fewer short nights or when sleepPairs is null", () => {
    const two = makeInput({
      sleepPairs: [
        night(T0, 6 * HOUR),
        night(T0 + DAY, 6 * HOUR),
        night(T0 + 2 * DAY, 8 * HOUR),
      ],
    });
    expect(computeSuggestions(two).some((s) => s.kind === "sleep-debt")).toBe(false);

    const none = makeInput({ sleepPairs: null });
    expect(computeSuggestions(none).some((s) => s.kind === "sleep-debt")).toBe(false);
  });
});

describe("correlation-insight rule", () => {
  it("flags the lowest-rated context at ≤2.0 mean over 5+ rated items", () => {
    const input = makeInput();
    input.occurrences = Array.from({ length: 5 }, (_, i) =>
      occ({
        start: T0 + i * DAY + 9 * HOUR,
        end: T0 + i * DAY + 10 * HOUR,
        categoryId: "catA",
        attributes: { satisfaction: 2 },
      }),
    );
    const s = computeSuggestions(input).find((x) => x.kind === "correlation-insight");
    expect(s?.id).toBe("correlation-insight:satisfaction:catA");
    expect(s?.evidence.n).toBe(5);
  });

  it("is silent for well-rated contexts and under the n gate", () => {
    const happy = makeInput();
    happy.occurrences = Array.from({ length: 5 }, (_, i) =>
      occ({
        start: T0 + i * DAY + 9 * HOUR,
        end: T0 + i * DAY + 10 * HOUR,
        categoryId: "catA",
        attributes: { satisfaction: 4 },
      }),
    );
    expect(
      computeSuggestions(happy).some((s) => s.kind === "correlation-insight"),
    ).toBe(false);

    const sparse = makeInput();
    sparse.occurrences = Array.from({ length: 4 }, (_, i) =>
      occ({
        start: T0 + i * DAY + 9 * HOUR,
        end: T0 + i * DAY + 10 * HOUR,
        categoryId: "catA",
        attributes: { satisfaction: 1 },
      }),
    );
    expect(
      computeSuggestions(sparse).some((s) => s.kind === "correlation-insight"),
    ).toBe(false);
  });
});

describe("rule: rest-window", () => {
  // Waking hours 08:00–20:00 (night window 20:00 → 08:00).
  const NIGHT = { startHour: 20, endHour: 8 };
  // A heavy day (9h) split into a morning block and a late-afternoon block,
  // leaving an open 13:00–16:00 stretch in waking hours.
  function heavyWithMiddayGap(dayMs: number): Occurrence[] {
    return [
      occ({ start: dayMs + 9 * HOUR, end: dayMs + 13 * HOUR }), // 09:00–13:00
      occ({ start: dayMs + 16 * HOUR, end: dayMs + 21 * HOUR }), // 16:00–21:00 (clipped to 20:00)
    ];
  }

  it("names the largest open waking gap on a heavy day", () => {
    const input = makeInput({ nightWindow: NIGHT });
    input.prevOccurrences = prevBaseline4h(input);
    input.occurrences = heavyWithMiddayGap(input.days[2]);
    const out = computeSuggestions(input).filter((s) => s.kind === "rest-window");
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe("rest-window:2026-06-03");
    expect(out[0].severity).toBe("info");
    expect(out[0].dayMs).toBe(input.days[2]);
    expect(out[0].meta?.[0]).toContain("13:00"); // gap starts at 13:00
  });

  it("stays silent without a night window", () => {
    const input = makeInput(); // nightWindow absent
    input.prevOccurrences = prevBaseline4h(input);
    input.occurrences = heavyWithMiddayGap(input.days[2]);
    expect(computeSuggestions(input).some((s) => s.kind === "rest-window")).toBe(false);
  });

  it("does not fire on a day that isn't heavy", () => {
    const input = makeInput({ nightWindow: NIGHT });
    input.prevOccurrences = prevBaseline4h(input); // 6h threshold
    input.occurrences = [
      occ({ start: input.days[2] + 9 * HOUR, end: input.days[2] + 11 * HOUR }), // 2h, light
    ];
    expect(computeSuggestions(input).some((s) => s.kind === "rest-window")).toBe(false);
  });

  it("ignores open time that falls inside the night window", () => {
    // Waking = [08:00, 12:00); a block fills it, and the only free stretch is at
    // night → no rest-window despite the day being heavy.
    const input = makeInput({ nightWindow: { startHour: 12, endHour: 8 } });
    input.prevOccurrences = prevBaseline4h(input);
    const d = input.days[2];
    input.occurrences = [
      occ({ start: d + 8 * HOUR, end: d + 12 * HOUR }), // fills waking 08–12
      occ({ start: d + 14 * HOUR, end: d + 22 * HOUR }), // 8h at night → overloads the day
    ];
    expect(computeSuggestions(input).some((s) => s.kind === "rest-window")).toBe(false);
  });

  it("does not fire when gaps stay under an hour", () => {
    const input = makeInput({ nightWindow: NIGHT });
    input.prevOccurrences = prevBaseline4h(input);
    const d = input.days[2];
    input.occurrences = [
      occ({ start: d + 8 * HOUR, end: d + 13 * HOUR }), // 08:00–13:00
      occ({ start: d + 13 * HOUR + 30 * 60_000, end: d + 20 * HOUR }), // 13:30–20:00 (30-min gap)
    ];
    expect(computeSuggestions(input).some((s) => s.kind === "rest-window")).toBe(false);
  });

  it("caps at two heavy days", () => {
    const input = makeInput({ nightWindow: NIGHT });
    input.prevOccurrences = input.prevDays.slice(0, 5).map((d) => dayLoad(d, 2));
    input.occurrences = [
      ...heavyWithMiddayGap(input.days[0]),
      ...heavyWithMiddayGap(input.days[1]),
      ...heavyWithMiddayGap(input.days[2]),
    ];
    const out = computeSuggestions(input).filter((s) => s.kind === "rest-window");
    expect(out).toHaveLength(2);
  });

  it("computes the waking window in the viewer zone (Berlin)", () => {
    const bDay = (n: number) => new TZDate(2026, 5, 1 + n, 0, 0, 0, BERLIN).getTime();
    const days = [0, 1, 2, 3, 4, 5, 6].map(bDay);
    const prevDays = [-7, -6, -5, -4, -3, -2, -1].map(bDay);
    const d = days[2];
    const input: SuggestionsInput = {
      t,
      locale: "en",
      occurrences: [
        occ({ start: d + 9 * HOUR, end: d + 13 * HOUR }), // 09:00–13:00 Berlin wall
        occ({ start: d + 16 * HOUR, end: d + 21 * HOUR }), // 16:00–21:00 Berlin wall
      ],
      prevOccurrences: prevDays.slice(0, 5).map((pd) => dayLoad(pd, 4)),
      tasks: [],
      window: { start: days[0], end: bDay(7) },
      prevWindow: { start: prevDays[0], end: days[0] },
      days,
      prevDays,
      timeZone: BERLIN,
      now: days[3] + HOUR,
      categoryName: (id) => id ?? "Uncategorized",
      nightWindow: NIGHT,
    };
    const out = computeSuggestions(input).filter((s) => s.kind === "rest-window");
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe("rest-window:2026-06-03");
    expect(out[0].meta?.[0]).toContain("13:00"); // wall-clock start, not 11:00 UTC
  });
});

describe("suppression", () => {
  it("filters muted kinds and leaves the rest", () => {
    const input = makeInput();
    input.prevOccurrences = prevBaseline4h(input);
    input.occurrences = [dayLoad(input.days[1], 8)];
    input.tasks = [task({ id: "t-s", dueDate: "2026-06-05" })];

    const all = computeSuggestions(input).map((s) => s.kind);
    expect(all).toContain("overloaded-day");
    expect(all).toContain("unscheduled-task");

    input.suppressedKinds = new Set(["overloaded-day"]);
    const muted = computeSuggestions(input).map((s) => s.kind);
    expect(muted).not.toContain("overloaded-day");
    expect(muted).toContain("unscheduled-task");
  });
});
