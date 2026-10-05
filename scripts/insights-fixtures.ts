/**
 * Insights golden fixtures — the contract between the TypeScript Insights
 * logic (lib/analytics/*, lib/insights/*) and its Kotlin port
 * (android/core/insights).
 *
 * Each area module `scripts/insights-fixtures/<area>.ts` runs the REAL web
 * functions over a case set and returns plain JSON; `pnpm fixtures:insights`
 * (scripts/export-insights-fixtures.ts) writes one file per area to
 * android/core/insights/src/test/resources/fixtures/<area>.json, and
 * test/insights-fixtures.test.ts rebuilds them in memory so any web-side drift
 * fails CI. The same command refreshes the `sha` fields of the Android strings
 * manifests (android/feature/insights/src/test/resources/strings-source).
 *
 * Builders are pure and deterministic and must never read the process zone:
 * the exporter digests every area again in child processes under UTC,
 * Pacific/Chatham and America/Santiago and refuses to write on a difference.
 *
 * ## JSON schema (version 1, every area)
 *
 * ```ts
 * type FixtureFile = {
 *   version: 1;
 *   generatedBy: "scripts/export-insights-fixtures.ts";
 *   area: Area;
 *   sections: Record<string, Case[]>;   // key order = the module's `sections` order
 * };
 * type Case = { name: string; input: object; expected: unknown };   // names unique per section
 * type Ms = number;                      // integer epoch ms (never ISO strings)
 * type Zone = string;                    // IANA id
 * type WindowJson = { start: Ms; end: Ms };   // half-open [start, end)
 * type SpanJson = {
 *   key: string; eventId: string; title: string; start: Ms; end: Ms;
 *   kind: "event" | "context"; allDay: boolean; inactive: boolean;
 *   ownerId: string; isShared: boolean; categoryId: string | null;
 *   attributes: Record<string, unknown>;   // RAW bag; may hold junk ("energy": "high")
 * };
 * type TaskJson = {
 *   id: string; title: string; parentId: string | null; collectionId: string | null;
 *   ownerId: string; assigneeId: string | null; createdAt: Ms; completedAt: Ms | null;
 *   dueDate: string | null;                // "yyyy-MM-dd"
 * };
 * ```
 *
 * - The TS side turns SpanJson into a full `Occurrence` with
 *   `attributes: parseAttributes(raw)` (shared.ts `toOccurrence`), and TaskJson
 *   into a `TaskRow` (`toTaskRow`), so the functions only see parsed attributes.
 * - Doubles are plain JSON numbers (shortest round trip). NaN and ±Infinity
 *   cannot be represented: serialization throws on them.
 * - Expected outputs keep the TS field names; enums are their TS string ids.
 * - Each area documents its own sections in its module's header.
 *
 * Serialization (`serializeInsightsFixture`) puts each case on one line of
 * compact JSON under an indented skeleton, plus a final newline: a diff names
 * the cases that changed, and the large matrices stay within the 1.5 MB budget
 * per file that the exporter enforces.
 */
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import type { AreaModule, Case } from "./insights-fixtures/shared";
import * as jsmath from "./insights-fixtures/jsmath";
import * as period from "./insights-fixtures/period";
import * as filters from "./insights-fixtures/filters";
import * as attributes from "./insights-fixtures/attributes";
import * as usage from "./insights-fixtures/usage";
import * as trends from "./insights-fixtures/trends";
import * as momentum from "./insights-fixtures/momentum";
import * as stats from "./insights-fixtures/stats";
import * as balance from "./insights-fixtures/balance";
import * as patterns from "./insights-fixtures/patterns";
import * as correlations from "./insights-fixtures/correlations";
import * as taskStats from "./insights-fixtures/task-stats";
import * as ledes from "./insights-fixtures/ledes";
import * as labels from "./insights-fixtures/labels";
import * as selectorsOverview from "./insights-fixtures/selectors-overview";
import * as selectorsTrends from "./insights-fixtures/selectors-trends";
import * as selectorsPatterns from "./insights-fixtures/selectors-patterns";
import * as selectorsTasks from "./insights-fixtures/selectors-tasks";
import * as dayDetail from "./insights-fixtures/day-detail";

export type { AreaModule, Case } from "./insights-fixtures/shared";

export const INSIGHTS_FIXTURES_DIR = "android/core/insights/src/test/resources/fixtures";
export const INSIGHTS_STRINGS_MANIFEST_DIR =
  "android/feature/insights/src/test/resources/strings-source";

export const INSIGHTS_FIXTURE_AREAS = [
  "jsmath",
  "period",
  "filters",
  "attributes",
  "usage",
  "trends",
  "momentum",
  "stats",
  "balance",
  "patterns",
  "correlations",
  "task-stats",
  "ledes",
  "labels",
  "selectors-overview",
  "selectors-trends",
  "selectors-patterns",
  "selectors-tasks",
  "day-detail",
] as const;

export type Area = (typeof INSIGHTS_FIXTURE_AREAS)[number];

/** Each file must stay at or below this many bytes. */
export const INSIGHTS_FIXTURE_MAX_BYTES = 1_500_000;

export interface FixtureFile {
  version: 1;
  generatedBy: "scripts/export-insights-fixtures.ts";
  area: Area;
  sections: Record<string, Case[]>;
}

export const INSIGHTS_AREA_MODULES: Record<Area, AreaModule> = {
  jsmath,
  period,
  filters,
  attributes,
  usage,
  trends,
  momentum,
  stats,
  balance,
  patterns,
  correlations,
  "task-stats": taskStats,
  ledes,
  labels,
  "selectors-overview": selectorsOverview,
  "selectors-trends": selectorsTrends,
  "selectors-patterns": selectorsPatterns,
  "selectors-tasks": selectorsTasks,
  "day-detail": dayDetail,
};

function buildArea(area: Area): FixtureFile {
  const mod = INSIGHTS_AREA_MODULES[area];
  const built = mod.build();
  const extra = Object.keys(built).filter((s) => !mod.sections.includes(s));
  if (extra.length > 0) {
    throw new Error(`${area}: sections ${extra.join(", ")} are not listed in \`sections\``);
  }
  const sections: Record<string, Case[]> = {};
  for (const section of mod.sections) {
    const cases = built[section];
    if (!cases) throw new Error(`${area}: section ${section} was not built`);
    const seen = new Set<string>();
    for (const c of cases) {
      if (seen.has(c.name)) throw new Error(`${area}/${section}: duplicate case name "${c.name}"`);
      seen.add(c.name);
    }
    sections[section] = cases;
  }
  return {
    version: 1,
    generatedBy: "scripts/export-insights-fixtures.ts",
    area,
    sections,
  };
}

/** Every area's fixture file, built from the real web code. */
export function buildInsightsFixtures(): Record<Area, FixtureFile> {
  const out = {} as Record<Area, FixtureFile>;
  for (const area of INSIGHTS_FIXTURE_AREAS) out[area] = buildArea(area);
  return out;
}

/** The exact bytes committed for a file (one case per line). Throws on NaN / ±Infinity. */
export function serializeInsightsFixture(f: FixtureFile): string {
  const value = (v: unknown): string =>
    JSON.stringify(v, (key, x) => {
      if (typeof x === "number" && !Number.isFinite(x)) {
        throw new Error(`${f.area}: non-finite number at "${key}"`);
      }
      return x;
    });
  const sections = Object.entries(f.sections).map(([name, cases]) =>
    cases.length === 0
      ? `  ${value(name)}: []`
      : `  ${value(name)}: [\n${cases.map((c) => `   ${value(c)}`).join(",\n")}\n  ]`,
  );
  return [
    "{",
    ` "version": ${value(f.version)},`,
    ` "generatedBy": ${value(f.generatedBy)},`,
    ` "area": ${value(f.area)},`,
    sections.length === 0 ? ` "sections": {}` : ` "sections": {\n${sections.join(",\n")}\n }`,
    "}",
    "",
  ].join("\n");
}

function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

/** sha256 (hex) of each area's serialization. */
export function digestInsightsFixtures(files: Record<Area, FixtureFile>): Record<Area, string> {
  const out = {} as Record<Area, string>;
  for (const area of INSIGHTS_FIXTURE_AREAS) out[area] = sha256(serializeInsightsFixture(files[area]));
  return out;
}

// --- Strings manifests (Android strings ↔ messages/*.json) --------------------------

/**
 * One manifest per Android strings file
 * (`strings-source/<file>.json` ↔ `res/values{,-ru}/strings_insights_<file>.xml`):
 *
 * ```ts
 * type StringsManifest = {
 *   file: string;                     // "strings_insights_<file>.xml"
 *   entries: {
 *     web: string | null;             // "<namespace>:<dotted key>" into messages/{en,ru}/<namespace>.json;
 *                                     // null for NEW strings and hard-coded web sources
 *     source?: string;                // origin when web is null ("NEW", "hour-heatmap.tsx:21")
 *     sha: string | null;             // first 16 hex of sha256(JSON.stringify([en, ru])); null when web is null
 *     android: Record<string, number>; // Android name → its format-arg count
 *   }[];
 * };
 * ```
 *
 * Written as `JSON.stringify(manifest, null, 2)` plus a newline.
 * `pnpm fixtures:insights` rewrites only the `sha` fields.
 */
export interface StringsManifestEntry {
  web: string | null;
  source?: string;
  sha: string | null;
  android: Record<string, number>;
}

export interface StringsManifest {
  file: string;
  entries: StringsManifestEntry[];
}

export const INSIGHTS_STRINGS_FILES = [
  "shell",
  "common",
  "overview",
  "trends",
  "patterns",
  "tasks",
] as const;

const catalogs = new Map<string, unknown>();

function catalog(locale: "en" | "ru", namespace: string): unknown {
  const file = path.resolve(process.cwd(), "messages", locale, `${namespace}.json`);
  let json = catalogs.get(file);
  if (json === undefined) {
    json = JSON.parse(readFileSync(file, "utf8"));
    catalogs.set(file, json);
  }
  return json;
}

/** The raw ICU value behind `<namespace>:<dotted key>` in one locale, or undefined. */
export function webMessage(locale: "en" | "ru", web: string): unknown {
  const [namespace, key] = web.split(":");
  if (!namespace || !key) throw new Error(`strings manifest: bad web key "${web}"`);
  let node: unknown = catalog(locale, namespace);
  for (const part of key.split(".")) {
    if (node === null || typeof node !== "object") return undefined;
    node = (node as Record<string, unknown>)[part];
  }
  return node;
}

/** The manifest hash of a web key; throws when it is missing in either locale. */
export function webMessageSha(web: string): string {
  const en = webMessage("en", web);
  const ru = webMessage("ru", web);
  if (en === undefined || ru === undefined) {
    throw new Error(`strings manifest: web key "${web}" no longer exists in messages/{en,ru}`);
  }
  return sha256(JSON.stringify([en, ru])).slice(0, 16);
}

export function stringsManifestPath(file: string): string {
  return path.resolve(process.cwd(), INSIGHTS_STRINGS_MANIFEST_DIR, `${file}.json`);
}

export function readStringsManifest(file: string): StringsManifest {
  return JSON.parse(readFileSync(stringsManifestPath(file), "utf8")) as StringsManifest;
}

export function serializeStringsManifest(m: StringsManifest): string {
  return `${JSON.stringify(m, null, 2)}\n`;
}

/** Rewrites the `sha` field of every manifest entry from messages/*.json. */
export function refreshStringsManifestHashes(): void {
  const dir = path.resolve(process.cwd(), INSIGHTS_STRINGS_MANIFEST_DIR);
  const present = readdirSync(dir).filter((f) => f.endsWith(".json")).map((f) => f.slice(0, -5));
  for (const file of present) {
    const manifest = readStringsManifest(file);
    for (const entry of manifest.entries) {
      entry.sha = entry.web === null ? null : webMessageSha(entry.web);
    }
    const next = serializeStringsManifest(manifest);
    if (next !== readFileSync(stringsManifestPath(file), "utf8")) {
      writeFileSync(stringsManifestPath(file), next);
    }
  }
}
