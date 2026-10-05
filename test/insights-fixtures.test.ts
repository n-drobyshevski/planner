import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import {
  INSIGHTS_AREA_MODULES,
  INSIGHTS_FIXTURES_DIR,
  INSIGHTS_FIXTURE_AREAS,
  INSIGHTS_STRINGS_FILES,
  buildInsightsFixtures,
  readStringsManifest,
  serializeInsightsFixture,
  serializeStringsManifest,
  stringsManifestPath,
  webMessageSha,
} from "@/scripts/insights-fixtures";

// The Kotlin Insights port (android/core/insights) replays the checked-in golden
// JSON. Rebuilding it here from the REAL web code makes any behavior drift fail
// CI until the fixtures are re-exported (`pnpm fixtures:insights`), and the
// Kotlin tests then show what to port. The Chatham child re-runs every builder
// in a hostile process zone, so a builder or a lib function that reads the
// machine zone fails here too, not only for whoever runs the exporter.
describe("insights golden fixtures", () => {
  const dir = path.resolve(process.cwd(), INSIGHTS_FIXTURES_DIR);
  const fresh = buildInsightsFixtures();
  const committed = (area: string) => readFileSync(path.join(dir, `${area}.json`), "utf8");

  it("match the checked-in JSON byte for byte (run `pnpm fixtures:insights` after a change)", () => {
    for (const area of INSIGHTS_FIXTURE_AREAS) {
      expect(committed(area), area).toBe(serializeInsightsFixture(fresh[area]));
    }
  });

  it("are independent of the process zone (rebuilt under Pacific/Chatham)", { timeout: 180_000 }, () => {
    const r = spawnSync(process.execPath, ["--import", "tsx", "scripts/insights-fixtures-digest.ts"], {
      env: { ...process.env, TZ: "Pacific/Chatham" },
      encoding: "utf8",
    });
    expect(r.status, r.stderr).toBe(0);
    const child = JSON.parse(r.stdout) as Record<string, string>;
    for (const area of INSIGHTS_FIXTURE_AREAS) {
      const sha = createHash("sha256").update(committed(area)).digest("hex");
      expect(child[area], area).toBe(sha);
    }
  });

  it("cover every promised section with uniquely named cases", () => {
    for (const area of INSIGHTS_FIXTURE_AREAS) {
      const file = JSON.parse(committed(area)) as { area: string; sections: Record<string, { name: string }[]> };
      expect(file.area).toBe(area);
      expect(Object.keys(file.sections), area).toEqual([...INSIGHTS_AREA_MODULES[area].sections]);
      for (const [section, cases] of Object.entries(file.sections)) {
        expect(cases.length, `${area}/${section}`).toBeGreaterThan(0);
        const names = cases.map((c) => c.name);
        expect(new Set(names).size, `${area}/${section}`).toBe(names.length);
      }
    }
  });

  it("hold exactly one file per area", () => {
    const files = readdirSync(dir).filter((f) => f.endsWith(".json")).sort();
    expect(files).toEqual(INSIGHTS_FIXTURE_AREAS.map((a) => `${a}.json`).sort());
  });
});

// Android copies Insights copy from messages/{en,ru}/*.json; each strings file
// has a manifest recording which web key feeds which Android names, with a hash
// of the web values. A web copy change shows up here until the Android strings
// are re-ported and `pnpm fixtures:insights` refreshes the hashes.
describe("insights Android strings manifests", () => {
  it("exist for every strings file, in canonical form", () => {
    for (const file of INSIGHTS_STRINGS_FILES) {
      const manifest = readStringsManifest(file);
      expect(manifest.file).toBe(`strings_insights_${file}.xml`);
      expect(readFileSync(stringsManifestPath(file), "utf8"), file).toBe(serializeStringsManifest(manifest));
    }
  });

  it("hash the current web copy (web copy changed: re-port the strings, then run `pnpm fixtures:insights`)", () => {
    for (const file of INSIGHTS_STRINGS_FILES) {
      for (const entry of readStringsManifest(file).entries) {
        if (entry.web === null) {
          expect(entry.sha, `${file}: ${JSON.stringify(entry.android)}`).toBeNull();
          continue;
        }
        expect(entry.sha, `${file}: ${entry.web}`).toBe(webMessageSha(entry.web));
      }
    }
  });
});
