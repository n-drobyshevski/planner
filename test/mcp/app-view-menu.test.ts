import { describe, expect, it } from "vitest";
import { STRINGS, VIEW_DEFAULTS, viewMenuFields, viewSettingsChanged } from "@/lib/mcp/app/view-model";

describe("viewMenuFields", () => {
  it("holds all three settings in Flows", () => {
    expect(viewMenuFields("flows")).toEqual(["groupBy", "attention", "mine"]);
  });

  it("drops grouping in Now and keeps only Only mine in Calendar", () => {
    expect(viewMenuFields("now")).toEqual(["attention", "mine"]);
    expect(viewMenuFields("calendar")).toEqual(["mine"]);
  });
});

describe("viewSettingsChanged", () => {
  it("is false on the defaults", () => {
    expect(viewSettingsChanged({ ...VIEW_DEFAULTS })).toBe(false);
    expect(viewSettingsChanged({ groupBy: "tag", attention: "combined", mine: false })).toBe(false);
  });

  it("is true when any setting is off its default", () => {
    expect(viewSettingsChanged({ groupBy: "collection", attention: "combined", mine: false })).toBe(true);
    expect(viewSettingsChanged({ groupBy: "tag", attention: "deadline", mine: false })).toBe(true);
    expect(viewSettingsChanged({ groupBy: "tag", attention: "combined", mine: true })).toBe(true);
  });

  it("looks only at the settings the view's menu shows", () => {
    const grouped = { groupBy: "assignee", attention: "combined", mine: false };
    expect(viewSettingsChanged(grouped, viewMenuFields("flows"))).toBe(true);
    expect(viewSettingsChanged(grouped, viewMenuFields("now"))).toBe(false);
    expect(viewSettingsChanged(grouped, viewMenuFields("calendar"))).toBe(false);
    expect(viewSettingsChanged({ ...grouped, mine: true }, viewMenuFields("calendar"))).toBe(true);
  });
});

describe("toolbar strings", () => {
  it("has a short label for every view in both locales", () => {
    for (const s of [STRINGS.en, STRINGS.ru]) {
      expect(Object.keys(s.viewsShort).sort()).toEqual(Object.keys(s.views).sort());
    }
  });

  it("keeps each short button label inside its full name (label in name)", () => {
    for (const s of [STRINGS.en, STRINGS.ru]) {
      expect(s.newTask.toLowerCase()).toContain(s.newTaskShort.toLowerCase());
      expect(s.backToToday.toLowerCase()).toContain(s.todayShort.toLowerCase());
      expect(s.viewChanged.toLowerCase()).toContain(s.view.toLowerCase());
      for (const view of ["calendar", "flows", "now"] as const) {
        expect(s.views[view].toLowerCase()).toContain(s.viewsShort[view].replace(/\.$/, "").toLowerCase());
      }
    }
  });
});
