"use client";

import { lineStyleStroke, wavePath, type FlowLineStyle } from "@/lib/tasks/flow-line-styles";

/** A short stroke drawn in `style`, tinted `color` — the line-style picker's live preview. */
export function LineStyleSample({ style, color }: { style: FlowLineStyle; color?: string }) {
  const { dasharray, opacityScale, wavy } = lineStyleStroke(style);
  const W = 40;
  const H = 14;
  const y = H / 2;
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden className="block">
      {wavy ? (
        <path
          d={wavePath(3, W - 3, y)}
          fill="none"
          stroke={color}
          strokeWidth={2}
          strokeOpacity={opacityScale}
          strokeLinecap="round"
        />
      ) : (
        <line
          x1={3}
          y1={y}
          x2={W - 3}
          y2={y}
          stroke={color}
          strokeWidth={2}
          strokeOpacity={opacityScale}
          strokeDasharray={dasharray}
          strokeLinecap="round"
        />
      )}
    </svg>
  );
}
