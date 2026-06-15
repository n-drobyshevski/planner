import { toPaletteColor } from "@/lib/theme/appearance";
import { lineStyleStroke, wavePath } from "@/lib/tasks/flow-line-styles";
import type { Board } from "@/lib/types";

/** A small filled circle in a board's color. */
export function Dot({ color, className }: { color: string; className?: string }) {
  return (
    <span
      className={className ?? "size-2.5 shrink-0 rounded-full"}
      style={{ backgroundColor: toPaletteColor(color) }}
    />
  );
}

/** A short stroke in a board's color + Flows line style — its line "personality". */
export function BoardLine({ board }: { board: Board }) {
  const { dasharray, opacityScale, wavy } = lineStyleStroke(board.lineStyle);
  const color = toPaletteColor(board.color);
  return (
    <svg width={18} height={10} viewBox="0 0 18 10" aria-hidden className="shrink-0">
      {wavy ? (
        <path
          d={wavePath(2, 16, 5)}
          fill="none"
          stroke={color}
          strokeWidth={2}
          strokeOpacity={opacityScale}
          strokeLinecap="round"
        />
      ) : (
        <line
          x1={2}
          y1={5}
          x2={16}
          y2={5}
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
