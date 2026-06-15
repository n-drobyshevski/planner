import { describe, it, expect } from "vitest";
import {
  FLOW_LINE_STYLES,
  DEFAULT_FLOW_LINE_STYLE,
  flowLineStyleSchema,
  asFlowLineStyle,
  lineStyleStroke,
  wavePath,
} from "@/lib/tasks/flow-line-styles";

describe("flow line styles", () => {
  it("exposes the full style set with solid as the default", () => {
    expect(FLOW_LINE_STYLES).toEqual([
      "solid",
      "dotted",
      "dashed",
      "dashdot",
      "longdash",
      "faded",
      "wavy",
    ]);
    expect(DEFAULT_FLOW_LINE_STYLE).toBe("solid");
  });

  it("narrows unknown / null values to the default, keeps valid ones", () => {
    expect(asFlowLineStyle("dashed")).toBe("dashed");
    expect(asFlowLineStyle("nonsense")).toBe("solid");
    expect(asFlowLineStyle(null)).toBe("solid");
    expect(asFlowLineStyle(undefined)).toBe("solid");
  });

  it("validates via the zod enum", () => {
    expect(flowLineStyleSchema.safeParse("wavy").success).toBe(true);
    expect(flowLineStyleSchema.safeParse("zigzag").success).toBe(false);
  });

  it("gives solid no dash, full opacity, no wave", () => {
    expect(lineStyleStroke("solid")).toEqual({ opacityScale: 1, wavy: false });
  });

  it("gives dash styles a dasharray and keeps them flat", () => {
    for (const s of ["dotted", "dashed", "dashdot", "longdash"] as const) {
      const r = lineStyleStroke(s);
      expect(r.dasharray).toBeTruthy();
      expect(r.wavy).toBe(false);
      expect(r.opacityScale).toBe(1);
    }
  });

  it("ghosts the faded style and flags wavy", () => {
    expect(lineStyleStroke("faded").opacityScale).toBeLessThan(1);
    expect(lineStyleStroke("faded").wavy).toBe(false);
    expect(lineStyleStroke("wavy").wavy).toBe(true);
    expect(lineStyleStroke("wavy").dasharray).toBeUndefined();
  });

  it("builds a sine path that starts at the origin and waves across", () => {
    const d = wavePath(0, 36, 7);
    expect(d.startsWith("M 0 7")).toBe(true);
    expect(d).toContain("Q"); // at least one quadratic hump
  });

  it("returns a flat move when the span is empty", () => {
    expect(wavePath(10, 10, 5)).toBe("M 10 5");
    expect(wavePath(20, 10, 5)).toBe("M 20 5");
  });
});
