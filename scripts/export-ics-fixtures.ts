/**
 * Write the .ics import golden fixtures consumed by the Kotlin port's tests
 * (android/core/ical). Cases and schema: scripts/ics-fixtures.ts.
 *
 * Run:  pnpm fixtures:ics
 *
 * Re-run (and commit the JSON) whenever lib/ical/* changes behavior;
 * test/ics-fixtures.test.ts fails until the checked-in file matches.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { ICS_FIXTURES_PATH, buildIcsFixtures, serializeIcsFixtures } from "./ics-fixtures";

const fixtures = buildIcsFixtures();
const target = path.resolve(process.cwd(), ICS_FIXTURES_PATH);
mkdirSync(path.dirname(target), { recursive: true });
writeFileSync(target, serializeIcsFixtures(fixtures));
const counts = Object.entries(fixtures)
  .map(([k, v]) => `${k}=${(v as unknown[]).length}`)
  .join(" ");
console.log(`Wrote ${ICS_FIXTURES_PATH} (${counts})`);
