/**
 * Insights fixtures, area "attributes" (owner: F0): the lenient attribute
 * parser (lib/attributes/schema.ts `parseAttributes`) that every analytics
 * function reads ratings through.
 *
 * ```ts
 * sections: {
 *   parse: {
 *     name;
 *     input: { raw: unknown };   // the jsonb bag as stored
 *     expected: { energy?: 1|2|3|4; flexibility?: string; focus?: string; satisfaction?: 1|2|3|4 };
 *   }[];
 * }
 * ```
 *
 * `expected` holds only the KNOWN keys that survive parsing (unknown keys are
 * kept by the web parser but no analytics function reads them).
 */
import { ATTRIBUTE_KEYS, parseAttributes } from "@/lib/attributes/schema";
import type { Case } from "./shared";

export const sections = ["parse"] as const;

const RAWS: [string, unknown][] = [
  ["empty object", {}],
  ["all valid", { energy: 3, flexibility: "movable", focus: "deep", satisfaction: 4 }],
  ["energy 1 and satisfaction 1", { energy: 1, satisfaction: 1 }],
  ["energy 4, focus shallow", { energy: 4, focus: "shallow" }],
  ["flexibility fixed", { flexibility: "fixed" }],
  ["flexibility flexible", { flexibility: "flexible" }],
  ["energy as word", { energy: "high" }],
  ["energy as numeric string", { energy: "3" }],
  ["satisfaction 3.0", { satisfaction: 3.0 }],
  ["energy 2.5", { energy: 2.5 }],
  ["energy 0", { energy: 0 }],
  ["satisfaction 5", { satisfaction: 5 }],
  ["energy true", { energy: true }],
  ["energy null", { energy: null }],
  ["focus true", { focus: true }],
  ["focus uppercase", { focus: "Deep" }],
  ["flexibility unknown word", { flexibility: "rigid" }],
  ["nested object value", { energy: { value: 2 }, focus: "deep" }],
  ["array value", { satisfaction: [3], flexibility: "movable" }],
  ["unknown keys only", { mood: "great", effort: 3 }],
  ["unknown keys beside valid", { mood: "great", energy: 2 }],
  ["junk beside valid", { energy: "high", satisfaction: 2, focus: 7 }],
  ["raw array", []],
  ["raw string", "x"],
  ["raw null", null],
  ["raw number", 3],
  ["negative energy", { energy: -1 }],
];

export function build(): Record<(typeof sections)[number], Case[]> {
  return {
    parse: RAWS.map(([name, raw]) => {
      const parsed = parseAttributes(raw) as Record<string, unknown>;
      const expected: Record<string, unknown> = {};
      for (const key of ATTRIBUTE_KEYS) {
        if (parsed[key] !== undefined) expected[key] = parsed[key];
      }
      return { name, input: { raw }, expected };
    }),
  };
}
