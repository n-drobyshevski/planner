import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  RECURRENCE_FIXTURES_PATH,
  buildRecurrenceFixtures,
  serializeRecurrenceFixtures,
} from "@/scripts/recurrence-fixtures";

// The Kotlin recurrence port (android/core/recurrence) asserts against the
// checked-in golden JSON. Regenerating it here from the REAL lib/recurrence code
// makes any web-side behavior change fail CI until the fixtures are re-exported
// (`pnpm fixtures:recurrence`) — and the Kotlin tests then show what to port.
describe("recurrence golden fixtures", () => {
  const file = readFileSync(path.resolve(process.cwd(), RECURRENCE_FIXTURES_PATH), "utf8");
  const fresh = buildRecurrenceFixtures();

  it("match the checked-in JSON (run `pnpm fixtures:recurrence` after a recurrence change)", () => {
    expect(JSON.parse(file)).toEqual(fresh);
    expect(file).toBe(serializeRecurrenceFixtures(fresh));
  });

  it("cover every section with uniquely named cases", () => {
    for (const [section, cases] of Object.entries(fresh)) {
      if (!Array.isArray(cases)) continue;
      expect(cases.length, section).toBeGreaterThan(0);
      const names = cases.map((c) => (c as { name: string }).name);
      expect(new Set(names).size, section).toBe(names.length);
    }
  });
});
