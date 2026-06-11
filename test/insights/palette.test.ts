// Enforces the dataviz color floor (IBM Carbon / UK Analysis Function):
// every --chart-N series fill must reach ≥3:1 contrast against the --card
// background it draws on, in EVERY palette flavor. The test parses
// app/globals.css (the single source of truth for the values) so a palette
// tweak that regresses legibility fails here instead of shipping.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  MIN_FILL_CONTRAST,
  SERIES_PALETTE,
  contrastRatio,
  relativeLuminance,
} from "@/lib/insights/palette";

const css = readFileSync(join(process.cwd(), "app", "globals.css"), "utf8");

/** The body of the first block whose selector starts a line (skips comments
 *  that merely mention the selector). */
function blockOf(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const m = new RegExp(`^${escaped}\\s*\\{`, "m").exec(css);
  expect(m, `selector not found in globals.css: ${selector}`).not.toBeNull();
  const at = (m as RegExpExecArray).index;
  const open = css.indexOf("{", at);
  let depth = 1;
  let i = open + 1;
  while (i < css.length && depth > 0) {
    if (css[i] === "{") depth += 1;
    else if (css[i] === "}") depth -= 1;
    i += 1;
  }
  return css.slice(open + 1, i - 1);
}

function varHex(block: string, name: string): string {
  const m = new RegExp(`--${name}\\s*:\\s*(#[0-9a-fA-F]{6})`).exec(block);
  expect(m, `--${name} (6-digit hex) not found in block`).not.toBeNull();
  return (m as RegExpExecArray)[1];
}

const CHART_VARS = ["chart-1", "chart-2", "chart-3", "chart-4", "chart-5"];

/** Each flavor's chart set is tested against every card surface it can draw
 *  on: its own --card, plus (for the default palette) the tone overrides,
 *  which swap the card hue without touching the chart colors. */
const cases: { label: string; chartBlock: string; cards: string[] }[] = (() => {
  const root = blockOf(":root");
  const dark = blockOf(".dark");
  // Tone overrides re-declare --card but keep the default chart sets.
  const toneCards = (mode: "light" | "dark") =>
    [...css.matchAll(/(\.dark)?\[data-tone="[a-z]+"\]\s*{[^}]*?--card:\s*(#[0-9a-fA-F]{6})/g)]
      .filter((m) => (mode === "dark") === Boolean(m[1]))
      .map((m) => m[2]);
  return [
    {
      label: "default light",
      chartBlock: root,
      cards: [varHex(root, "card"), ...toneCards("light")],
    },
    {
      label: "default dark",
      chartBlock: dark,
      cards: [varHex(dark, "card"), ...toneCards("dark")],
    },
    ...["latte", "frappe", "macchiato", "mocha"].map((flavor) => {
      const block = blockOf(`[data-palette="catppuccin-${flavor}"]`);
      return { label: `catppuccin-${flavor}`, chartBlock: block, cards: [varHex(block, "card")] };
    }),
  ];
})();

describe("insights chart palette", () => {
  it("SERIES_PALETTE references the five chart tokens in order", () => {
    expect(SERIES_PALETTE).toEqual([
      "var(--chart-1)",
      "var(--chart-2)",
      "var(--chart-3)",
      "var(--chart-4)",
      "var(--chart-5)",
    ]);
  });

  for (const { label, chartBlock, cards } of cases) {
    it(`${label}: every chart fill clears ${MIN_FILL_CONTRAST}:1 on its card surfaces`, () => {
      for (const chartVar of CHART_VARS) {
        const fill = varHex(chartBlock, chartVar);
        for (const card of cards) {
          const ratio = contrastRatio(fill, card);
          expect(
            ratio,
            `${label} --${chartVar} ${fill} on card ${card}: ${ratio.toFixed(2)}:1`,
          ).toBeGreaterThanOrEqual(MIN_FILL_CONTRAST);
        }
      }
    });
  }

  it("contrastRatio matches known WCAG fixtures", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 5);
    expect(contrastRatio("#ffffff", "#000000")).toBeCloseTo(21, 5);
    expect(contrastRatio("#777777", "#777777")).toBeCloseTo(1, 5);
    // Order-independent and matches the published luminance of pure red.
    expect(relativeLuminance("#ff0000")).toBeCloseTo(0.2126, 4);
  });
});
