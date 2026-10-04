/**
 * Write the recurrence golden fixtures consumed by the Kotlin port's tests
 * (android/core/recurrence). The case set, the JSON schema, and the conventions
 * are documented in scripts/recurrence-fixtures.ts.
 *
 * Run:  pnpm fixtures:recurrence
 *
 * Re-run (and commit the JSON) whenever lib/recurrence/* changes behavior;
 * test/recurrence-fixtures.test.ts fails until the checked-in file matches.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import {
  RECURRENCE_FIXTURES_PATH,
  buildRecurrenceFixtures,
  serializeRecurrenceFixtures,
} from "./recurrence-fixtures";

const fixtures = buildRecurrenceFixtures();
const target = path.resolve(process.cwd(), RECURRENCE_FIXTURES_PATH);
mkdirSync(path.dirname(target), { recursive: true });
writeFileSync(target, serializeRecurrenceFixtures(fixtures));

const counts = Object.entries(fixtures)
  .filter(([, v]) => Array.isArray(v))
  .map(([k, v]) => `${k}=${(v as unknown[]).length}`)
  .join(" ");
console.log(`Wrote ${RECURRENCE_FIXTURES_PATH} (${counts})`);
