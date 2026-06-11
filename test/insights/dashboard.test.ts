import { describe, it, expect } from "vitest";
import {
  DASHBOARD_CARDS,
  isCustomized,
  layoutRuns,
  moveCard,
  normalizeLayout,
  type DashboardCardId,
} from "@/lib/insights/dashboard";

const DEFAULT_ORDER = DASHBOARD_CARDS.map((c) => c.id);

describe("normalizeLayout", () => {
  it("yields the registry default for undefined/empty input", () => {
    for (const stored of [undefined, {}, { order: [], hidden: [] }]) {
      const layout = normalizeLayout(stored);
      expect(layout.order).toEqual(DEFAULT_ORDER);
      expect(layout.hidden.size).toBe(0);
    }
  });

  it("keeps the stored order and appends cards it doesn't know", () => {
    const layout = normalizeLayout({ order: ["per-day", "total"] });
    expect(layout.order.slice(0, 2)).toEqual(["per-day", "total"]);
    expect([...layout.order].sort()).toEqual([...DEFAULT_ORDER].sort());
    expect(layout.order).toHaveLength(DEFAULT_ORDER.length);
  });

  it("drops unknown and duplicate ids from order and hidden", () => {
    const layout = normalizeLayout({
      order: ["total", "removed-card", "total", "shifts"],
      hidden: ["nope", "by-context", "by-context"],
    });
    expect(layout.order.filter((id) => id === "total")).toHaveLength(1);
    expect(layout.order).not.toContain("removed-card");
    expect([...layout.hidden]).toEqual(["by-context"]);
  });
});

describe("layoutRuns", () => {
  it("groups consecutive visible stats into one StatGrid run", () => {
    const runs = layoutRuns(normalizeLayout(undefined));
    expect(runs[0]).toEqual({
      type: "stats",
      ids: [
        "total",
        "daily-avg",
        "busiest-day",
        "active-days",
        "tasks-done",
        "on-time",
        "overdue",
      ],
    });
    expect(runs.slice(1).map((r) => (r.type === "section" ? r.id : null))).toEqual([
      "per-day",
      "by-context",
      "shifts",
      "goals",
    ]);
  });

  it("splits stat runs when a section is interleaved, and skips hidden cards", () => {
    const layout = normalizeLayout({
      order: ["total", "per-day", "daily-avg", "busiest-day"],
      hidden: ["daily-avg", "by-context", "shifts", "goals", "active-days", "tasks-done", "on-time", "overdue"],
    });
    expect(layoutRuns(layout)).toEqual([
      { type: "stats", ids: ["total"] },
      { type: "section", id: "per-day" },
      { type: "stats", ids: ["busiest-day"] },
    ]);
  });
});

describe("moveCard", () => {
  const order = DEFAULT_ORDER;

  it("swaps with the neighbour in the given direction", () => {
    const next = moveCard(order, "daily-avg", "up");
    expect(next[0]).toBe("daily-avg");
    expect(next[1]).toBe("total");
  });

  it("is a no-op at the edges and for unknown ids", () => {
    expect(moveCard(order, "total", "up")).toBe(order);
    expect(moveCard(order, order[order.length - 1], "down")).toBe(order);
    expect(moveCard(order, "bogus" as DashboardCardId, "down")).toBe(order);
  });
});

describe("isCustomized", () => {
  it("is false for the default layout and true after any change", () => {
    expect(isCustomized(normalizeLayout(undefined))).toBe(false);
    expect(isCustomized(normalizeLayout({ hidden: ["shifts"] }))).toBe(true);
    expect(
      isCustomized(normalizeLayout({ order: ["per-day", ...DEFAULT_ORDER] })),
    ).toBe(true);
  });
});
