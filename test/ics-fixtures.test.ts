import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

import { ICS_FIXTURES_PATH, buildIcsFixtures, serializeIcsFixtures } from "@/scripts/ics-fixtures";

// The Kotlin .ics port (android/core/ical) asserts against the checked-in
// golden JSON. Regenerating it here from the real lib/ical code makes any
// web-side behavior change fail until the fixtures are re-exported
// (`pnpm fixtures:ics`) — and the Kotlin tests then show what to port.
describe(".ics import golden fixtures", () => {
  const file = readFileSync(path.resolve(process.cwd(), ICS_FIXTURES_PATH), "utf8");
  const fresh = buildIcsFixtures();

  it("match the checked-in JSON (run `pnpm fixtures:ics` after an lib/ical change)", () => {
    expect(file).toBe(serializeIcsFixtures(fresh));
  });

  it("cover every section with uniquely named cases", () => {
    for (const [section, cases] of Object.entries(fresh)) {
      expect(cases.length, section).toBeGreaterThan(0);
      const names = (cases as { name: string }[]).map((c) => c.name);
      expect(new Set(names).size, section).toBe(names.length);
    }
  });
});
