// Fractional ranking for drag-and-drop ordering. Tasks carry a `position`
// (double precision); inserting between two neighbors picks the midpoint so we
// never have to renumber the whole column. Pure — no I/O.

/**
 * A sort position strictly between two neighbors.
 * - both null  -> 0 (first item ever)
 * - before null -> after - 1 (drop at the very top)
 * - after null  -> before + 1 (drop at the very bottom)
 * - both given  -> midpoint
 */
export function positionBetween(
  before: number | null,
  after: number | null,
): number {
  if (before == null && after == null) return 0;
  if (before == null) return (after as number) - 1;
  if (after == null) return before + 1;
  return (before + after) / 2;
}
