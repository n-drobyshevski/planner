import { toPaletteColor } from "@/lib/theme/appearance";
import { lineStyleStroke, wavePath } from "@/lib/tasks/flow-line-styles";
import type { Collection } from "@/lib/types";

/** A small filled circle in a collection's color. */
export function Dot({ color, className }: { color: string; className?: string }) {
  return (
    <span
      className={className ?? "size-2.5 shrink-0 rounded-full"}
      style={{ backgroundColor: toPaletteColor(color) }}
    />
  );
}

/** A short stroke in a collection's color + Flows line style — its line "personality". */
export function CollectionLine({ collection }: { collection: Collection }) {
  const { dasharray, opacityScale, wavy } = lineStyleStroke(collection.lineStyle);
  const color = toPaletteColor(collection.color);
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
