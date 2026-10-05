/**
 * Child entry of the Insights fixture zone-independence check: builds every
 * area and prints `{ area → sha256 }` as JSON. Its process already starts with
 * `TZ` set from the environment, so a static import is fine here. Run by
 * scripts/export-insights-fixtures.ts and test/insights-fixtures.test.ts.
 */
import { buildInsightsFixtures, digestInsightsFixtures } from "./insights-fixtures";

process.stdout.write(JSON.stringify(digestInsightsFixtures(buildInsightsFixtures())));
