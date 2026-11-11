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
//
// With the task's history (`phases`), the bar is cut where its state changed
// (lib/tasks/task-state): each stretch in its state's style, planned = card
// with a dotted edge, in progress = a diagonal hatch with a solid edge, done =
// the solid tone with a white title and a check. The subtask fill gives way to
// them; the count stays in the bar's accessible name.

import type { Runway } from "@/lib/tasks/flows-runway";
import { stateSegments, type Phase, type StateSegment } from "@/lib/tasks/task-state";

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

/** A stretch narrower than this (px) joins its neighbour; a done one at the end keeps room for its check. */
export const PHASE_MIN_PX = 6;
export const DONE_PHASE_MIN_PX = 18;

/** The bar [x1, x2] cut where the task's state changed, in px; empty without phases. */
export function runwayPhaseSegments(
  phases: readonly Phase[] | undefined,
  x: (ms: number) => number,
  x1: number,
  x2: number,
  nowX: number,
): StateSegment[] {
  if (!phases || phases.length === 0) return [];
  const now = phases[phases.length - 1].state;
  return stateSegments(
    phases.map((p) => ({ state: p.state, x: x(p.from) })),
    x1,
    x2,
    { minWidth: PHASE_MIN_PX, currentMinWidth: now === "done" ? DONE_PHASE_MIN_PX : PHASE_MIN_PX, maxX: nowX },
  );
}

/** The parts of [a, b] outside every range (ranges sorted, non-overlapping). */
function outside(ranges: readonly [number, number][], a: number, b: number): [number, number][] {
  const out: [number, number][] = [];
  let at = a;
  for (const [r0, r1] of ranges) {
    if (r1 <= at || r0 >= b) continue;
    if (r0 > at) out.push([at, r0]);
    at = Math.max(at, r1);
  }
  if (b > at) out.push([at, b]);
  return out;
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
  phases,
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
  /** the task's states over time (phasesOf): the bar is cut where they change */
  phases?: readonly Phase[];
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
  const segs = runwayPhaseSegments(phases, x, x1, x2, nowX);
  const phased = segs.length > 0;
  const fillW = phased ? 0 : done ? w : w * r.progress;
  const tint = phased || done ? 0 : planned ? PLANNED_TINT : TINT;
  // An open-ended bar fades out over its last stretch (past now / its start).
  const fadeStart = Math.max(x1, x2 - Math.min(w * 0.6, 64));
  const ids = { clip: `${uid}-c`, fade: `${uid}-f`, mask: `${uid}-m`, ta: `${uid}-ta`, tb: `${uid}-tb`, wip: `${uid}-w` };

  const lastSeg = segs[segs.length - 1];
  const endsDone = phased ? lastSeg.state === "done" && lastSeg.x1 - lastSeg.x0 >= 16 : done && w > 40;
  const fontSize = small ? 11 : 12;
  const pad = small ? 6 : 8;
  const checkRoom = endsDone ? 14 : 0;
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
  // White words over the solid tone (the progress fill, or done stretches),
  // ink over everything else; a done bar without phases is all tint.
  const solid: [number, number][] = phased
    ? segs.filter((g) => g.state === "done").map((g) => [g.x0, g.x1])
    : fillW > 0.5 && !done
      ? [[x1, x1 + fillW]]
      : [];
  const onSolid = (px: number) => solid.some(([a, b]) => px >= a && px < b);
  const textA = tx - 1;
  const whiteText = solid
    .map(([a, b]): [number, number] => [Math.max(a, textA), Math.min(b, textEnd)])
    .filter(([a, b]) => b > a);
  const inkText = outside(solid, textA, textEnd);

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
        {segs.map((g, i) => (
          <clipPath key={i} id={`${uid}-s${i}`}>
            <rect x={g.x0} y={top - 2} width={g.x1 - g.x0} height={h + 4} />
          </clipPath>
        ))}
        {segs.some((g) => g.state === "wip") && (
          <pattern
            id={ids.wip}
            patternUnits="userSpaceOnUse"
            width={small ? 5 : 7}
            height={small ? 5 : 7}
            patternTransform="rotate(45)"
          >
            <rect width={7} height={7} fill="var(--card)" />
            <line x1={1.5} y1={0} x2={1.5} y2={7} stroke={tone} strokeWidth={small ? 2 : 3} strokeOpacity={0.3} />
          </pattern>
        )}
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
              {whiteText.map(([a, b], i) => (
                <rect key={i} x={a} y={top} width={b - a} height={h} />
              ))}
            </clipPath>
            <clipPath id={ids.tb}>
              {inkText.map(([a, b], i) => (
                <rect key={i} x={a} y={top} width={b - a} height={h} />
              ))}
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
        {/* phases: each stretch's fill, then its own stretch of the edge */}
        {segs.map((g, i) =>
          g.state === "planned" ? null : (
            <rect
              key={`f${i}`}
              x={g.x0}
              y={top}
              width={g.x1 - g.x0}
              height={h}
              fill={g.state === "done" ? tone : `url(#${ids.wip})`}
              clipPath={`url(#${ids.clip})`}
            />
          ),
        )}
        {phased ? (
          segs.map((g, i) => (
            <rect
              key={`o${i}`}
              x={x1 + 0.5}
              y={top + 0.5}
              width={Math.max(0, w - 1)}
              height={h - 1}
              rx={Math.max(0, rx - 0.5)}
              fill="none"
              stroke={late && g.state !== "planned" ? "var(--destructive)" : g.state === "done" ? tone : color}
              strokeOpacity={late && g.state !== "planned" ? 1 : g.state === "done" ? 1 : mine ? 0.95 : 0.6}
              strokeWidth={late && g.state !== "planned" ? 1.5 : 1.25}
              strokeDasharray={g.state === "planned" ? DOTS : undefined}
              clipPath={`url(#${uid}-s${i})`}
            />
          ))
        ) : (
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
        )}
      </g>

      {showTitle && (
        <>
          {whiteText.length > 0 && (
            <text
              x={tx}
              y={cy}
              dominantBaseline="central"
              fontSize={fontSize}
              fontWeight={500}
              fill="#ffffff"
              textDecoration={done ? "line-through" : undefined}
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
          fill={onSolid(lead + lockSize / 2) ? "#ffffff" : "var(--runway-ink)"}
          transform={`translate(${Math.min(lead, x2 - lockSize - 2) - (small ? 2 : 3)} ${cy - lockSize / 2}) scale(${lockSize / 16})`}
        />
      )}

      {/* done: a check at the bar's end, a second, colour-free signal (white
          on a done stretch, ink on the muted done bar) */}
      {checkRoom > 0 && (
        <path
          d={`M ${x2 - 15} ${cy} l 2.5 2.8 l 4.5 -5.4`}
          fill="none"
          stroke={phased ? "#ffffff" : "var(--runway-ink)"}
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
