import { toPaletteColor } from "@/lib/theme/appearance";
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

/** A short solid stroke in a collection's color (line style now lives per-board). */
export function CollectionLine({ collection }: { collection: Collection }) {
  const color = toPaletteColor(collection.color);
  return (
    <svg width={18} height={10} viewBox="0 0 18 10" aria-hidden className="shrink-0">
      <line
        x1={2}
        y1={5}
        x2={16}
        y2={5}
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
      />
    </svg>
  );
}
