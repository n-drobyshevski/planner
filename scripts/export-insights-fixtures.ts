/**
 * Write the Insights golden fixtures consumed by the Kotlin port's tests
 * (android/core/insights) and refresh the Android strings-manifest hashes. The
 * pipeline, the common JSON schema and the area list are documented in
 * scripts/insights-fixtures.ts.
 *
 * Run:  pnpm fixtures:insights
 *
 * Only `node:` modules are imported statically. ESM/CJS imports are hoisted,
 * so a `TZ` assignment below them would run after the builders and lib/** had
 * already been evaluated; pinning TZ first and loading the registry
 * dynamically keeps every module-scope value zone-free. The registry is then
 * digested again in child processes under UTC and two hostile zones
 * (Pacific/Chatham +12:45/+13:45, America/Santiago with its DST gap at
 * midnight), and nothing is written unless all of them agree.
 *
 * Re-run (and commit the JSON) whenever the web Insights logic or its copy
 * changes; test/insights-fixtures.test.ts fails until the files match.
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const HOSTILE_ZONES = ["UTC", "Pacific/Chatham", "America/Santiago"];

async function main(): Promise<void> {
  process.env.TZ = "UTC"; // before the module graph loads
  const reg = await import("./insights-fixtures"); // evaluated under UTC
  const files = reg.buildInsightsFixtures();
  const local = reg.digestInsightsFixtures(files);

  for (const tz of HOSTILE_ZONES) {
    const r = spawnSync(
      process.execPath,
      ["--import", "tsx", "scripts/insights-fixtures-digest.ts"],
      { env: { ...process.env, TZ: tz }, encoding: "utf8" },
    );
    if (r.status !== 0) throw new Error(`digest under ${tz} failed:\n${r.stderr}`);
    const child = JSON.parse(r.stdout) as Record<string, string>;
    for (const area of reg.INSIGHTS_FIXTURE_AREAS) {
      if (child[area] !== local[area]) {
        throw new Error(
          `fixtures for "${area}" differ under TZ=${tz}: a builder or the code under test reads the process zone`,
        );
      }
    }
  }

  const dir = path.resolve(process.cwd(), reg.INSIGHTS_FIXTURES_DIR);
  mkdirSync(dir, { recursive: true });
  const counts: string[] = [];
  for (const area of reg.INSIGHTS_FIXTURE_AREAS) {
    const text = reg.serializeInsightsFixture(files[area]);
    const bytes = Buffer.byteLength(text);
    if (bytes > reg.INSIGHTS_FIXTURE_MAX_BYTES) {
      throw new Error(`${area}.json is ${bytes} bytes, over the ${reg.INSIGHTS_FIXTURE_MAX_BYTES} budget`);
    }
    writeFileSync(path.join(dir, `${area}.json`), text);
    const cases = Object.values(files[area].sections).reduce((n, s) => n + s.length, 0);
    counts.push(`${area}=${cases}`);
  }
  reg.refreshStringsManifestHashes();
  console.log(`Wrote ${reg.INSIGHTS_FIXTURES_DIR} (${counts.join(" ")}); refreshed strings manifests`);
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
