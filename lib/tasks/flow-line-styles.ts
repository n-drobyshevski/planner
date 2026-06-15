// The selectable line styles for a collection, carried into the Flows timeline as
// the stroke pattern of that collection's task trunks/branches. One source of truth
// shared by the collection dialog's preview picker and the Flows renderer (mirrors
// how CONTEXT_PALETTE is shared by every color picker). Pure + deterministic.
import { z } from "zod";

export const FLOW_LINE_STYLES = [
  "solid",
  "dotted",
  "dashed",
  "dashdot",
  "longdash",
  "faded",
  "wavy",
] as const;

export type FlowLineStyle = (typeof FLOW_LINE_STYLES)[number];

export const DEFAULT_FLOW_LINE_STYLE: FlowLineStyle = "solid";

export const flowLineStyleSchema = z.enum(FLOW_LINE_STYLES);

/** Narrow an arbitrary string to a known style, falling back to the default. */
export function asFlowLineStyle(v: string | null | undefined): FlowLineStyle {
  return (FLOW_LINE_STYLES as readonly string[]).includes(v ?? "")
    ? (v as FlowLineStyle)
    : DEFAULT_FLOW_LINE_STYLE;
}

export interface LineStroke {
  /** SVG stroke-dasharray (px); omitted for solid/faded/wavy. */
  dasharray?: string;
  /** multiplies the base stroke opacity so `faded` ghosts the line. */
  opacityScale: number;
  /** the trunk must be drawn as a sine <path> rather than a straight <line>. */
  wavy: boolean;
}

/**
 * The stroke recipe for a style. Dash patterns are tuned for the trunk width
 * (~2.5px, round caps) so they stay legible across the day/week/month zooms.
 */
export function lineStyleStroke(style: FlowLineStyle): LineStroke {
  switch (style) {
    case "dotted":
      return { dasharray: "1.5 4", opacityScale: 1, wavy: false };
    case "dashed":
      return { dasharray: "7 5", opacityScale: 1, wavy: false };
    case "dashdot":
      return { dasharray: "9 4 1.5 4", opacityScale: 1, wavy: false };
    case "longdash":
      return { dasharray: "14 6", opacityScale: 1, wavy: false };
    case "faded":
      return { opacityScale: 0.5, wavy: false };
    case "wavy":
      return { opacityScale: 1, wavy: true };
    case "solid":
    default:
      return { opacityScale: 1, wavy: false };
  }
}

/**
 * A horizontal sine wave from x1 to x2 at height y, as an SVG path. Each `len`
 * span is one half-wave (alternating above/below the baseline) drawn as a smooth
 * quadratic hump, so the line reads as a gentle wave at any width. x2 may be
 * less than x1 (empty) — guarded to a flat move.
 */
export function wavePath(x1: number, x2: number, y: number, amp = 2, len = 9): string {
  if (x2 - x1 < 1) return `M ${x1} ${y}`;
  let d = `M ${x1} ${y}`;
  let dir = -1; // first hump rises (SVG y grows downward)
  for (let x = x1; x < x2; x += len) {
    const nx = Math.min(x + len, x2);
    const cx = (x + nx) / 2;
    d += ` Q ${cx} ${y + dir * amp} ${nx} ${y}`;
    dir *= -1;
  }
  return d;
}
