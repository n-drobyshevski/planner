import { describe, it, expect } from "vitest";
import {
  buildRRule,
  parseRRule,
  summarizeRecurrence,
  type RecurrenceForm,
} from "@/lib/recurrence/rrule-build";

describe("summarizeRecurrence", () => {
  it("weekly on a single day", () => {
    expect(
      summarizeRecurrence({ freq: "WEEKLY", interval: 1, byWeekday: [0], end: { type: "never" } }),
    ).toBe("Repeats weekly on Mon");
  });

  it("every N weeks on multiple days", () => {
    expect(
      summarizeRecurrence({ freq: "WEEKLY", interval: 2, byWeekday: [2, 0], end: { type: "never" } }),
    ).toBe("Repeats every 2 weeks on Mon, Wed");
  });

  it("daily with an until date", () => {
    expect(
      summarizeRecurrence({
        freq: "DAILY",
        interval: 1,
        byWeekday: [],
        end: { type: "until", dateMs: new Date(2026, 5, 30).getTime() },
      }),
    ).toBe("Repeats daily, until Jun 30, 2026");
  });

  it("monthly with a count", () => {
    expect(
      summarizeRecurrence({
        freq: "MONTHLY",
        interval: 1,
        byWeekday: [],
        end: { type: "count", count: 5 },
      }),
    ).toBe("Repeats monthly, 5 times");
  });
});

describe("buildRRule", () => {
  it("returns null for null form", () => {
    expect(buildRRule(null)).toBeNull();
  });

  it("daily with interval 2 -> FREQ=DAILY;INTERVAL=2", () => {
    const form: RecurrenceForm = {
      freq: "DAILY",
      interval: 2,
      byWeekday: [],
      end: { type: "never" },
    };
    expect(buildRRule(form)).toBe("FREQ=DAILY;INTERVAL=2");
  });

  it("omits INTERVAL when interval is 1", () => {
    const form: RecurrenceForm = {
      freq: "DAILY",
      interval: 1,
      byWeekday: [],
      end: { type: "never" },
    };
    expect(buildRRule(form)).toBe("FREQ=DAILY");
  });

  it("weekly MO,WE -> FREQ=WEEKLY;BYDAY=MO,WE", () => {
    const form: RecurrenceForm = {
      freq: "WEEKLY",
      interval: 1,
      byWeekday: [0, 2],
      end: { type: "never" },
    };
    expect(buildRRule(form)).toBe("FREQ=WEEKLY;BYDAY=MO,WE");
  });

  it("weekly MO,WE,FR with sorted output regardless of input order", () => {
    const form: RecurrenceForm = {
      freq: "WEEKLY",
      interval: 1,
      byWeekday: [4, 0, 2],
      end: { type: "never" },
    };
    expect(buildRRule(form)).toBe("FREQ=WEEKLY;BYDAY=MO,WE,FR");
  });

  it("weekly with SU (index 6) maps to SU", () => {
    const form: RecurrenceForm = {
      freq: "WEEKLY",
      interval: 2,
      byWeekday: [6],
      end: { type: "never" },
    };
    expect(buildRRule(form)).toBe("FREQ=WEEKLY;INTERVAL=2;BYDAY=SU");
  });

  it("monthly recurrence", () => {
    const form: RecurrenceForm = {
      freq: "MONTHLY",
      interval: 1,
      byWeekday: [],
      end: { type: "never" },
    };
    expect(buildRRule(form)).toBe("FREQ=MONTHLY");
  });

  it("monthly with interval 3", () => {
    const form: RecurrenceForm = {
      freq: "MONTHLY",
      interval: 3,
      byWeekday: [],
      end: { type: "never" },
    };
    expect(buildRRule(form)).toBe("FREQ=MONTHLY;INTERVAL=3");
  });

  it("until -> UTC basic format YYYYMMDDTHHMMSSZ", () => {
    const dateMs = Date.UTC(2026, 11, 31, 23, 0, 0);
    const form: RecurrenceForm = {
      freq: "WEEKLY",
      interval: 1,
      byWeekday: [0],
      end: { type: "until", dateMs },
    };
    expect(buildRRule(form)).toBe(
      "FREQ=WEEKLY;BYDAY=MO;UNTIL=20261231T230000Z"
    );
  });

  it("count -> COUNT", () => {
    const form: RecurrenceForm = {
      freq: "DAILY",
      interval: 1,
      byWeekday: [],
      end: { type: "count", count: 10 },
    };
    expect(buildRRule(form)).toBe("FREQ=DAILY;COUNT=10");
  });

  it("daily with weekdays -> FREQ=DAILY;BYDAY (interval omitted)", () => {
    const form: RecurrenceForm = {
      freq: "DAILY",
      interval: 1,
      byWeekday: [0, 2, 4],
      end: { type: "never" },
    };
    expect(buildRRule(form)).toBe("FREQ=DAILY;BYDAY=MO,WE,FR");
  });

  it("daily with weekdays drops INTERVAL even when interval > 1", () => {
    const form: RecurrenceForm = {
      freq: "DAILY",
      interval: 3,
      byWeekday: [0],
      end: { type: "never" },
    };
    expect(buildRRule(form)).toBe("FREQ=DAILY;BYDAY=MO");
  });

  it("monthly does not emit BYDAY even if byWeekday is set", () => {
    const form: RecurrenceForm = {
      freq: "MONTHLY",
      interval: 1,
      byWeekday: [0, 1],
      end: { type: "never" },
    };
    expect(buildRRule(form)).toBe("FREQ=MONTHLY");
  });

  it("weekly with empty byWeekday omits BYDAY", () => {
    const form: RecurrenceForm = {
      freq: "WEEKLY",
      interval: 1,
      byWeekday: [],
      end: { type: "never" },
    };
    expect(buildRRule(form)).toBe("FREQ=WEEKLY");
  });
});

describe("parseRRule", () => {
  it("returns null for null input", () => {
    expect(parseRRule(null)).toBeNull();
  });

  it("parses daily interval 2", () => {
    expect(parseRRule("FREQ=DAILY;INTERVAL=2")).toEqual({
      freq: "DAILY",
      interval: 2,
      byWeekday: [],
      end: { type: "never" },
    });
  });

  it("parses interval-1 string back to interval 1", () => {
    expect(parseRRule("FREQ=DAILY")).toEqual({
      freq: "DAILY",
      interval: 1,
      byWeekday: [],
      end: { type: "never" },
    });
  });

  it("parses weekly BYDAY back to sorted 0..6 indices", () => {
    expect(parseRRule("FREQ=WEEKLY;BYDAY=FR,MO,WE")).toEqual({
      freq: "WEEKLY",
      interval: 1,
      byWeekday: [0, 2, 4],
      end: { type: "never" },
    });
  });

  it("parses SU back to index 6", () => {
    expect(parseRRule("FREQ=WEEKLY;BYDAY=SU")).toEqual({
      freq: "WEEKLY",
      interval: 1,
      byWeekday: [6],
      end: { type: "never" },
    });
  });

  it("parses UNTIL to dateMs", () => {
    const dateMs = Date.UTC(2026, 11, 31, 23, 0, 0);
    expect(parseRRule("FREQ=WEEKLY;BYDAY=MO;UNTIL=20261231T230000Z")).toEqual({
      freq: "WEEKLY",
      interval: 1,
      byWeekday: [0],
      end: { type: "until", dateMs },
    });
  });

  it("parses COUNT", () => {
    expect(parseRRule("FREQ=DAILY;COUNT=10")).toEqual({
      freq: "DAILY",
      interval: 1,
      byWeekday: [],
      end: { type: "count", count: 10 },
    });
  });

  it("parses monthly", () => {
    expect(parseRRule("FREQ=MONTHLY;INTERVAL=3")).toEqual({
      freq: "MONTHLY",
      interval: 3,
      byWeekday: [],
      end: { type: "never" },
    });
  });
});

describe("round-trips", () => {
  const forms: RecurrenceForm[] = [
    { freq: "DAILY", interval: 1, byWeekday: [], end: { type: "never" } },
    { freq: "DAILY", interval: 2, byWeekday: [], end: { type: "never" } },
    {
      freq: "WEEKLY",
      interval: 1,
      byWeekday: [0, 2, 4],
      end: { type: "never" },
    },
    {
      freq: "WEEKLY",
      interval: 3,
      byWeekday: [6],
      end: { type: "count", count: 5 },
    },
    {
      freq: "MONTHLY",
      interval: 1,
      byWeekday: [],
      end: { type: "never" },
    },
    {
      freq: "WEEKLY",
      interval: 1,
      byWeekday: [0],
      end: { type: "until", dateMs: Date.UTC(2026, 11, 31, 23, 0, 0) },
    },
  ];

  for (const form of forms) {
    it(`parse(build(x)) deep-equals x for ${JSON.stringify(form)}`, () => {
      const built = buildRRule(form);
      expect(parseRRule(built)).toEqual(form);
    });
  }

  it("until round-trip with dateMs=Date.UTC(2026,11,31,23,0,0)", () => {
    const form: RecurrenceForm = {
      freq: "WEEKLY",
      interval: 2,
      byWeekday: [1, 3],
      end: { type: "until", dateMs: Date.UTC(2026, 11, 31, 23, 0, 0) },
    };
    expect(parseRRule(buildRRule(form))).toEqual(form);
  });
});

// --- Adversarial hardening: lock in exact weekday-index<->token mapping,
// seconds-level UNTIL precision, RRULE: prefix tolerance, and the
// build->string->parse inverse from the string side. ---
describe("weekday index <-> RFC token mapping (full sweep)", () => {
  const expected: ReadonlyArray<readonly [number, string]> = [
    [0, "MO"],
    [1, "TU"],
    [2, "WE"],
    [3, "TH"],
    [4, "FR"],
    [5, "SA"],
    [6, "SU"],
  ];

  for (const [idx, token] of expected) {
    it(`buildRRule maps index ${idx} -> ${token}`, () => {
      const form: RecurrenceForm = {
        freq: "WEEKLY",
        interval: 1,
        byWeekday: [idx],
        end: { type: "never" },
      };
      expect(buildRRule(form)).toBe(`FREQ=WEEKLY;BYDAY=${token}`);
    });

    it(`parseRRule maps ${token} -> index ${idx}`, () => {
      expect(parseRRule(`FREQ=WEEKLY;BYDAY=${token}`)?.byWeekday).toEqual([
        idx,
      ]);
    });
  }

  it("builds all seven days in sorted order", () => {
    const form: RecurrenceForm = {
      freq: "WEEKLY",
      interval: 1,
      byWeekday: [6, 5, 4, 3, 2, 1, 0],
      end: { type: "never" },
    };
    expect(buildRRule(form)).toBe(
      "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR,SA,SU"
    );
  });
});

describe("UNTIL precision", () => {
  it("preserves non-midnight, non-zero seconds exactly", () => {
    // 2026-07-04T09:07:05Z -> exercises HH, MM, SS all non-zero.
    const dateMs = Date.UTC(2026, 6, 4, 9, 7, 5);
    const built = buildRRule({
      freq: "DAILY",
      interval: 1,
      byWeekday: [],
      end: { type: "until", dateMs },
    });
    expect(built).toBe("FREQ=DAILY;UNTIL=20260704T090705Z");
    const parsed = parseRRule(built);
    expect(parsed?.end).toEqual({ type: "until", dateMs });
  });

  it("zero-pads single-digit month/day/time fields", () => {
    // 2026-01-02T03:04:05Z -> all fields require padding.
    const dateMs = Date.UTC(2026, 0, 2, 3, 4, 5);
    const built = buildRRule({
      freq: "DAILY",
      interval: 1,
      byWeekday: [],
      end: { type: "until", dateMs },
    });
    expect(built).toBe("FREQ=DAILY;UNTIL=20260102T030405Z");
    expect(parseRRule(built)?.end).toEqual({ type: "until", dateMs });
  });
});

describe("parseRRule robustness", () => {
  it("tolerates a leading RRULE: prefix (stored form)", () => {
    expect(parseRRule("RRULE:FREQ=WEEKLY;BYDAY=MO,WE")).toEqual({
      freq: "WEEKLY",
      interval: 1,
      byWeekday: [0, 2],
      end: { type: "never" },
    });
  });

  it("parses INTERVAL=1 explicitly back to interval 1", () => {
    // A stored string could carry an explicit INTERVAL=1.
    expect(parseRRule("FREQ=DAILY;INTERVAL=1")).toEqual({
      freq: "DAILY",
      interval: 1,
      byWeekday: [],
      end: { type: "never" },
    });
  });
});

describe("build -> parse inverse from the string side", () => {
  const strings: readonly string[] = [
    "FREQ=DAILY",
    "FREQ=DAILY;INTERVAL=2",
    "FREQ=WEEKLY;BYDAY=MO,WE,FR",
    "FREQ=WEEKLY;INTERVAL=2;BYDAY=SU",
    "FREQ=MONTHLY",
    "FREQ=MONTHLY;INTERVAL=3",
    "FREQ=DAILY;COUNT=10",
    "FREQ=WEEKLY;BYDAY=MO;UNTIL=20261231T230000Z",
  ];

  for (const s of strings) {
    it(`build(parse(x)) === x for "${s}"`, () => {
      const parsed = parseRRule(s);
      expect(parsed).not.toBeNull();
      expect(buildRRule(parsed)).toBe(s);
    });
  }
});
