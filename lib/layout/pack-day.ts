// Horizontal overlap packing for one day's TIMED items.
//
// Pure function: vertical placement (top/height from start/end) is handled
// elsewhere. This module only decides how overlapping intervals share the
// horizontal axis.
//
// One layout strategy — a stepped SPREAD across the full day width. For an
// overlapping cluster, items get greedy columns (colCount = max concurrency);
// every block keeps a uniform, reduced width and its left edge steps right by
// SPREAD_STEP, so the last column lands flush-right: 2 cols → 0–75/25–100, 3 →
// 0–50/25–75/50–100 (left, center, right), 4 → four 25% columns touching. Later
// starts layer in front (z), so each covered block still shows a SPREAD_STEP strip
// on its left. Dense clusters (spread width below SPREAD_MIN_WIDTH, i.e. colCount
// >= 5) fall back to equal side-by-side tiles with rightward span fill. A single
// (non-overlapping) item always keeps the full width.
//
// Column ORDER depends on the mode:
//   • Single (options.mode === "single"): one column group; columns follow start
//     order across the whole cluster.
//   • Overlay (two calendars): columns are ordered by owner — "mine" (`mine`
//     truthy) take the left columns, the partner's the right — so the two stay on
//     their sides while every concurrent block keeps the SAME width. One event
//     each → 0–75 / 25–100 (the classic lane split); when only one owner has
//     events in a cluster, theirs simply use the full width.
// z-index follows start time across the WHOLE cluster (later start sits in front),
// so blocks interleave correctly where columns overlap.
//
// Times are epoch milliseconds. Intervals are half-open [start, end):
// two intervals overlap iff a.start < b.end && b.start < a.end (touching
// endpoints do NOT overlap).

// Resting z-index of an event block (must match event-block.tsx's z-[var(--evt-z,10)]).
const BASE_Z = 10;
// Stay below the selected/hover layer (z-30) so those always win.
const MAX_Z = 29;
// Spread step: each successive column's left edge advances by this % of the day
// width and block widths shrink so the last column is flush-right (100%). With
// two columns this yields the 0–75 / 25–100 split (each 75% wide).
const SPREAD_STEP = 25;
// Below this width the spread would be too thin / non-positive (colCount ≥ 5
// with the 25% step) → fall back to equal side-by-side tiles.
const SPREAD_MIN_WIDTH = 25;

export interface LayoutInterval {
  start: number;
  end: number;
  /** Owner side: truthy = mine (left columns), false = the other person's (right
   *  columns). Absent is treated as mine. Ignored when mode is "single". */
  mine?: boolean;
}

export interface PackOptions {
  /** "overlay" (default): two-calendar view — columns are ordered by owner (mine
   *  left, partner right) so the two stay on their sides at uniform width.
   *  "single": one calendar — columns follow start order (`mine` is ignored). */
  mode?: "overlay" | "single";
}

export interface PackedColumn {
  /** index into the original input array (result[i] corresponds to items[i]) */
  index: number;
  /** assigned column within the item's cluster (0-based) */
  colIndex: number;
  /** total number of columns in the item's cluster */
  colCount: number;
  /** number of columns this item spans rightward (>= 1); always 1 when spread */
  colSpan: number;
  /** left offset as a percentage of the day width [0, 100] */
  leftPct: number;
  /** width as a percentage of the day width (0, 100] */
  widthPct: number;
  /** stacking order; later-starting items sit in front (used as the block's z-index) */
  zIndex: number;
}

function overlaps(a: LayoutInterval, b: LayoutInterval): boolean {
  return a.start < b.end && b.start < a.end;
}

interface Working {
  /** original input index */
  index: number;
  start: number;
  end: number;
  colIndex: number;
  /** cluster id (transitively-overlapping group) */
  cluster: number;
  /** owner side: true = mine (left columns), false = the other person's (right) */
  mine: boolean;
}

export function packDay<T extends LayoutInterval>(
  items: T[],
  options: PackOptions = {},
): PackedColumn[] {
  const mode = options.mode ?? "overlay";
  const n = items.length;
  if (n === 0) return [];

  // Working copy retaining original index, sorted by start asc then end desc.
  const work: Working[] = items.map((it, index) => ({
    index,
    start: it.start,
    end: it.end,
    colIndex: -1,
    cluster: -1,
    mine: it.mine ?? true,
  }));
  work.sort((a, b) => {
    if (a.start !== b.start) return a.start - b.start;
    return b.end - a.end;
  });

  // Partition into clusters of transitively-overlapping items. Because the
  // list is sorted by start, a new cluster begins whenever an item's start is
  // at or beyond the maximum end seen so far in the current cluster. (Column
  // assignment is done later, per owner, so mine/other never share a column.)
  let clusterId = 0;
  let clusterMaxEnd = -Infinity;
  for (let i = 0; i < work.length; i++) {
    const item = work[i];
    if (i === 0 || item.start >= clusterMaxEnd) {
      // gap: start a new cluster (i === 0 always opens cluster 0)
      if (i !== 0) clusterId++;
      clusterMaxEnd = item.end;
    } else {
      clusterMaxEnd = Math.max(clusterMaxEnd, item.end);
    }
    item.cluster = clusterId;
  }

  // Group working items by cluster.
  const clusters = new Map<number, Working[]>();
  for (const item of work) {
    let arr = clusters.get(item.cluster);
    if (!arr) {
      arr = [];
      clusters.set(item.cluster, arr);
    }
    arr.push(item);
  }

  const result = new Array<PackedColumn>(n);

  for (const members of clusters.values()) {
    // z follows start order across the WHOLE cluster, so where columns overlap
    // the later-starting block wins (mine/other interleave correctly).
    // `members` preserves the global start-asc (end-desc) order from grouping.
    const zByIndex = new Map<number, number>();
    members.forEach((item, rank) => {
      zByIndex.set(item.index, Math.min(BASE_Z + rank, MAX_Z));
    });

    // A lone (non-overlapping) item keeps the full width regardless of owner.
    if (members.length === 1) {
      const it = members[0];
      result[it.index] = {
        index: it.index,
        colIndex: 0,
        colCount: 1,
        colSpan: 1,
        leftPct: 0,
        widthPct: 100,
        zIndex: zByIndex.get(it.index)!,
      };
      continue;
    }

    // Assign columns, then spread them across the FULL width (uniform reduced
    // widths, last column flush-right; dense clusters tile). In single mode the
    // whole cluster is one column group. In overlay mode columns are ordered by
    // owner — mine first (left), the partner's next (right) — so the two stay on
    // their sides while every concurrent block keeps the same width. With one
    // event each this yields the 0–75 / 25–100 split; when only one owner has
    // events here, theirs simply use the full width.
    let colCount: number;
    if (mode === "single") {
      colCount = assignColumns(members);
    } else {
      const mineCols = assignColumns(members.filter((m) => m.mine));
      const otherGroup = members.filter((m) => !m.mine);
      const otherCols = assignColumns(otherGroup);
      for (const o of otherGroup) o.colIndex += mineCols; // partner columns sit right of mine
      colCount = mineCols + otherCols;
    }
    layoutColumns(members, colCount, result, zByIndex);
  }

  return result;
}

/**
 * Greedy first-fit column assignment over `group` (mutates each item's
 * `colIndex`): place each item in the first column whose last placed item does
 * not overlap it, else open a new column. Returns the column count, which for an
 * interval set equals its maximum concurrency (0 for an empty group). `group`
 * must be start-sorted.
 */
function assignColumns(group: Working[]): number {
  if (group.length === 0) return 0;
  const lastInColumn: Working[] = [];
  for (const item of group) {
    let placed = false;
    for (let c = 0; c < lastInColumn.length; c++) {
      if (!overlaps(lastInColumn[c], item)) {
        item.colIndex = c;
        lastInColumn[c] = item;
        placed = true;
        break;
      }
    }
    if (!placed) {
      item.colIndex = lastInColumn.length;
      lastInColumn.push(item);
    }
  }
  return group.reduce((m, it) => Math.max(m, it.colIndex), 0) + 1;
}

/**
 * Lay out a cluster's items across the FULL day width given their already-assigned
 * `colIndex` and the cluster's `colCount`. While the spread width stays >=
 * SPREAD_MIN_WIDTH (colCount <= 4) blocks spread (left → center → right, uniform
 * reduced width stepped by SPREAD_STEP, last column flush-right); denser clusters
 * fall back to equal side-by-side tiles with rightward span fill. Stacking uses
 * the cluster-wide `zByIndex` (later start in front).
 */
function layoutColumns(
  group: Working[],
  colCount: number,
  result: PackedColumn[],
  zByIndex: Map<number, number>,
): void {
  const spreadW = 100 - SPREAD_STEP * (colCount - 1);
  const spread = spreadW >= SPREAD_MIN_WIDTH;

  for (const item of group) {
    const zIndex = zByIndex.get(item.index)!;

    if (spread) {
      // Step right by column at a fixed width; the last column lands flush against
      // the right edge (left → center → right), layered by z so each covered block
      // keeps a SPREAD_STEP strip exposed on its left.
      result[item.index] = {
        index: item.index,
        colIndex: item.colIndex,
        colCount,
        colSpan: 1,
        leftPct: item.colIndex * SPREAD_STEP,
        widthPct: spreadW,
        zIndex,
      };
      continue;
    }

    // Dense cluster: equal columns. Expand colSpan rightward until a column holds
    // an overlapping item or the right edge is reached.
    let span = 1;
    for (let c = item.colIndex + 1; c < colCount; c++) {
      let blocked = false;
      for (const other of group) {
        if (other === item) continue;
        if (other.colIndex === c && overlaps(item, other)) {
          blocked = true;
          break;
        }
      }
      if (blocked) break;
      span++;
    }

    result[item.index] = {
      index: item.index,
      colIndex: item.colIndex,
      colCount,
      colSpan: span,
      leftPct: (item.colIndex / colCount) * 100,
      widthPct: (span / colCount) * 100,
      zIndex,
    };
  }
}
