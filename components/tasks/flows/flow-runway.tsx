"use client";

// The "runway" lane style: a task drawn as a bar from its start to its deadline
// (the runway it has), filled from the left by the share of its subtasks that
// are done. Geometry is pure (lib/tasks/flows-runway); this file only paints,
// inside FlowTrack's aria-hidden SVG — the focusable button over each bar lives
// in FlowTrack with the other hit targets.
//
// Meaning never rests on colour alone: late = a hatched overrun to the now-line
// plus "2 days over"; planned = the dotted "pencilled in" outline; done = a full
// muted bar with a check and a struck-through title; no deadline = no right
// edge (the bar fades out past now) and no deadline label.

import type { Runway } from "@/lib/tasks/flows-runway";

const DOTS = "2 2.5"; // the calendar's "pencilled in / not yet real" dash

/** A padlock on a 16×16 grid: the "waits for another task" mark. */
export const LOCK_PATH =
  "M5 7V5a3 3 0 0 1 6 0v2h.5A1.5 1.5 0 0 1 13 8.5v5A1.5 1.5 0 0 1 11.5 15h-7A1.5 1.5 0 0 1 3 13.5v-5A1.5 1.5 0 0 1 4.5 7H5Zm1.5 0h3V5a1.5 1.5 0 0 0-3 0v2Z";

/** Tint strengths over the card for the empty runway, a planned one, and a done bar. */
const TINT = 0.16;
const PLANNED_TINT = 0.07;
const DONE_TINT = 0.26;

/**
 * The solid progress tone for a lane colour: the same hue with its lightness
 * capped at 0.44 (and chroma at 0.13, to stay in gamut), so white text on it
 * clears 7:1 in every palette and theme. The empty runway is a tint of this
 * tone, never of the raw swatch, which keeps the tint dark-anchored and the
 * title on it AAA too (see --runway-ink in app/globals.css).
 */
export function runwayTone(color: string): string {
  return `oklch(from ${color} min(l, 0.44) min(c, 0.13) h)`;
}

/** Pixel extent of a runway: its bar (min. one bar-height wide) and its overrun. */
export function runwayExtent(
  r: Runway,
  x: (ms: number) => number,
  h: number,
): { x1: number; x2: number; reach: number } {
  const x1 = x(r.startMs);
  const x2 = Math.max(x(r.endMs), x1 + h);
  const reach = r.overrun ? Math.max(x2, x(r.overrun.toMs)) : x2;
  return { x1, x2, reach };
}

/** Rough advance width of a short label (11px UI font), for collision nudges. */
export function labelWidth(text: string, fontSize: number): number {
  return text.length * fontSize * 0.58;
}

/** The hatch every late overrun shares (defined once per track). */
export function RunwayHatch({ id }: { id: string }) {
  return (
    <pattern
      id={id}
      patternUnits="userSpaceOnUse"
      width={6}
      height={6}
      patternTransform="rotate(45)"
    >
      <rect width={6} height={6} fill="var(--card)" />
      <line x1={1} y1={0} x2={1} y2={6} stroke="var(--destructive)" strokeWidth={2} strokeOpacity={0.5} />
    </pattern>
  );
}

export function RunwayBar({
  uid,
  r,
  x,
  cy,
  h,
  color,
  mine,
  nowX,
  hatchId,
  title,
  short,
  small,
  viewLeft = 0,
  blocked,
}: {
  /** unique, url-safe id prefix for this bar's clip/mask defs */
  uid: string;
  r: Runway;
  x: (ms: number) => number;
  cy: number;
  h: number;
  /** the lane's stroke-legible colour (toPaletteStroke) */
  color: string;
  mine: boolean;
  nowX: number;
  hatchId: string;
  /** title drawn inside the bar (clipped); omitted on slim stream bars */
  title?: string;
  /** short deadline label just right of the bar's end ("due tomorrow", "2 days over") */
  short?: string | null;
  /** a subtask branch bar: smaller type and corners */
  small?: boolean;
  /** the canvas's scroll offset: the title holds at the visible left edge */
  viewLeft?: number;
  /** waits on an unfinished task: a padlock leads the bar (never colour alone) */
  blocked?: boolean;
}) {
  const { x1, x2, reach } = runwayExtent(r, x, h);
  const top = cy - h / 2;
  const w = x2 - x1;
  const rx = Math.min(small ? 4 : 6, h / 2);
  const tone = runwayTone(color);
  const late = r.state === "late";
  const done = r.state === "done";
  const planned = r.state === "planned";
  const outline = late ? "var(--destructive)" : color;
  const outlineOpacity = done ? 0.4 : mine ? 0.95 : 0.6;
  const fillW = done ? w : w * r.progress;
  const tint = done ? 0 : planned ? PLANNED_TINT : TINT;
  // An open-ended bar fades out over its last stretch (past now / its start).
  const fadeStart = Math.max(x1, x2 - Math.min(w * 0.6, 64));
  const ids = { clip: `${uid}-c`, fade: `${uid}-f`, mask: `${uid}-m`, ta: `${uid}-ta`, tb: `${uid}-tb` };

  const fontSize = small ? 11 : 12;
  const pad = small ? 6 : 8;
  const checkRoom = done && w > 40 ? 14 : 0;
  // An open-ended bar has no right edge, so its title may run on past the fade
  // (onto the card-coloured canvas, where the ink is still AAA).
  const textEnd = r.openEnded ? x2 + 4000 : x2 - pad - checkRoom;
  // Hold the title at the visible left edge while the bar's start is scrolled
  // off, but never push it past the point where it would no longer fit.
  const lockSize = small ? 9 : 11;
  const lockRoom = blocked ? lockSize + 4 : 0;
  const lead = Math.min(Math.max(x1, viewLeft) + pad, Math.max(x1 + pad, x2 - pad - 80));
  const tx = lead + lockRoom;
  const showTitle = !!title && textEnd - tx > 18;
  // White title over the solid fill, ink over the tint; a done bar is all tint.
  const split = done ? x1 : x1 + fillW;

  let lx = reach + 6;
  if (short) {
    const lw = labelWidth(short, small ? 10.5 : 11);
    // Never straddle the now-line (it is drawn above the SVG): hop past it.
    if (nowX > lx - 3 && nowX < lx + lw + 3) lx = nowX + 6;
  }

  return (
    <g>
      <defs>
        <clipPath id={ids.clip}>
          <rect x={x1} y={top} width={w} height={h} rx={rx} />
        </clipPath>
        {r.openEnded && (
          <>
            <linearGradient
              id={ids.fade}
              gradientUnits="userSpaceOnUse"
              x1={fadeStart}
              y1={0}
              x2={x2}
              y2={0}
            >
              <stop offset="0" stopColor="#fff" stopOpacity={1} />
              <stop offset="1" stopColor="#fff" stopOpacity={0} />
            </linearGradient>
            <mask
              id={ids.mask}
              maskUnits="userSpaceOnUse"
              x={x1 - 2}
              y={top - 2}
              width={w + 4}
              height={h + 4}
            >
              <rect x={x1 - 2} y={top - 2} width={w + 4} height={h + 4} fill={`url(#${ids.fade})`} />
            </mask>
          </>
        )}
        {showTitle && (
          <>
            <clipPath id={ids.ta}>
              <rect x={tx - 1} y={top} width={Math.max(0, Math.min(split, textEnd) - tx + 1)} height={h} />
            </clipPath>
            <clipPath id={ids.tb}>
              <rect
                x={Math.max(split, tx - 1)}
                y={top}
                width={Math.max(0, textEnd - Math.max(split, tx - 1))}
                height={h}
              />
            </clipPath>
          </>
        )}
      </defs>

      {/* late: the hatched overrun from the deadline to the now-line, tucked
          under the bar's rounded end so the two read as one shape */}
      {late && reach - x2 > 0.5 && (
        <rect
          x={x2 - rx}
          y={top}
          width={reach - x2 + rx}
          height={h}
          rx={rx}
          fill={`url(#${hatchId})`}
          stroke="var(--destructive)"
          strokeOpacity={0.7}
          strokeWidth={1}
        />
      )}

      <g mask={r.openEnded ? `url(#${ids.mask})` : undefined}>
        {/* opaque card base: gridlines never show through, and the title's
            contrast is always measured against a known surface */}
        <rect x={x1} y={top} width={w} height={h} rx={rx} fill="var(--card)" />
        {tint > 0 && (
          <rect x={x1} y={top} width={w} height={h} rx={rx} fill={tone} fillOpacity={tint} />
        )}
        {fillW > 0.5 && (
          <rect
            x={x1}
            y={top}
            width={fillW}
            height={h}
            fill={tone}
            fillOpacity={done ? DONE_TINT : 1}
            clipPath={`url(#${ids.clip})`}
          />
        )}
        <rect
          x={x1 + 0.5}
          y={top + 0.5}
          width={Math.max(0, w - 1)}
          height={h - 1}
          rx={Math.max(0, rx - 0.5)}
          fill="none"
          stroke={outline}
          strokeOpacity={late ? 1 : outlineOpacity}
          strokeWidth={late ? 1.5 : 1.25}
          strokeDasharray={planned ? DOTS : undefined}
        />
      </g>

      {showTitle && (
        <>
          {split > tx && (
            <text
              x={tx}
              y={cy}
              dominantBaseline="central"
              fontSize={fontSize}
              fontWeight={500}
              fill="#ffffff"
              clipPath={`url(#${ids.ta})`}
            >
              {title}
            </text>
          )}
          <text
            x={tx}
            y={cy}
            dominantBaseline="central"
            fontSize={fontSize}
            fontWeight={500}
            fill="var(--runway-ink)"
            textDecoration={done ? "line-through" : undefined}
            clipPath={`url(#${ids.tb})`}
          >
            {title}
          </text>
        </>
      )}

      {/* blocked: a padlock at the bar's visible start, ahead of the title */}
      {blocked && (
        <path
          d={LOCK_PATH}
          fill={split > lead + lockSize ? "#ffffff" : "var(--runway-ink)"}
          transform={`translate(${Math.min(lead, x2 - lockSize - 2) - (small ? 2 : 3)} ${cy - lockSize / 2}) scale(${lockSize / 16})`}
        />
      )}

      {/* done: a check at the bar's end, a second, colour-free signal */}
      {checkRoom > 0 && (
        <path
          d={`M ${x2 - 15} ${cy} l 2.5 2.8 l 4.5 -5.4`}
          fill="none"
          stroke="var(--runway-ink)"
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}

      {short && (
        <text
          x={lx}
          y={cy}
          dominantBaseline="central"
          fontSize={small ? 10.5 : 11}
          fontWeight={late ? 600 : 500}
          fill={late ? "var(--destructive)" : "var(--muted-foreground)"}
          className="tabular-nums"
        >
          {short}
        </text>
      )}
    </g>
  );
}
