// Horizontal overlap packing for one day's TIMED items.
//
// Pure function: vertical placement (top/height from start/end) is handled
// elsewhere. This module only decides how overlapping intervals share the
// horizontal axis.
//
// Two strategies, chosen per overlapping cluster by its column count:
//   • Cascade (small clusters, <= CASCADE_MAX): every block extends to the
//     cluster's right edge and is staggered right by a fixed step, layered by
//     z-index. The front block stays fully readable and earlier blocks peek out
//     on the left. Because blocks differ only by left offset + z, revealing a
//     covered block is a pure z-index change (no layout/animation).
//   • Split (dense clusters): equal side-by-side lanes with rightward span fill
//     (the classic non-overlapping tiling), so crowded slots stay legible.
// In both, z-index follows start time (later start sits in front).
//
// Times are epoch milliseconds. Intervals are half-open [start, end):
// two intervals overlap iff a.start < b.end && b.start < a.end (touching
// endpoints do NOT overlap).

// Clusters with at most this many columns cascade; denser ones tile (split).
const CASCADE_MAX = 4;
// Per-column horizontal stagger cap (% of day width).
const MAX_STEP_PCT = 28;
// Total stagger cap (% of day width) → the front block keeps >= ~55% width.
const MAX_OFFSET_PCT = 45;
// Resting z-index of an event block (must match event-block.tsx's z-[var(--evt-z,10)]).
const BASE_Z = 10;
// Stay below the selected/hover layer (z-30) so those always win.
const MAX_Z = 29;

export interface LayoutInterval {
  start: number;
  end: number;
}

export interface PackedColumn {
  /** index into the original input array (result[i] corresponds to items[i]) */
  index: number;
  /** assigned column within the item's cluster (0-based) */
  colIndex: number;
  /** total number of columns in the item's cluster */
  colCount: number;
  /** number of columns this item spans rightward (>= 1); always 1 when cascaded */
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
}

export function packDay<T extends LayoutInterval>(items: T[]): PackedColumn[] {
  const n = items.length;
  if (n === 0) return [];

  // Working copy retaining original index, sorted by start asc then end desc.
  const work: Working[] = items.map((it, index) => ({
    index,
    start: it.start,
    end: it.end,
    colIndex: -1,
    cluster: -1,
  }));
  work.sort((a, b) => {
    if (a.start !== b.start) return a.start - b.start;
    return b.end - a.end;
  });

  // Greedy column assignment: place each item in the first column whose last
  // placed item does not overlap it; otherwise open a new column.
  const lastInColumn: Working[] = []; // lastInColumn[c] = last item placed in column c
  for (const item of work) {
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

  // Partition into clusters of transitively-overlapping items. Because the
  // list is sorted by start, a new cluster begins whenever an item's start is
  // at or beyond the maximum end seen so far in the current cluster.
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
    const colCount = members.reduce((m, it) => Math.max(m, it.colIndex), 0) + 1;
    const cascade = colCount <= CASCADE_MAX;
    // Per-column stagger, capped so the total offset never eats more than
    // MAX_OFFSET_PCT of the width (keeps the front block readable).
    const stepPct = cascade
      ? Math.min(MAX_STEP_PCT, MAX_OFFSET_PCT / Math.max(1, colCount - 1))
      : 0;

    // `members` preserves the global start-asc (end-desc) order from the cluster
    // grouping above, so the array index is the start rank: later starts get a
    // higher z-index and therefore sit in front.
    members.forEach((item, rank) => {
      const zIndex = Math.min(BASE_Z + rank, MAX_Z);

      if (cascade) {
        // Stagger right by column; every block runs to the cluster's right edge,
        // so blocks differ only by left offset + z-index.
        const leftPct = item.colIndex * stepPct;
        result[item.index] = {
          index: item.index,
          colIndex: item.colIndex,
          colCount,
          colSpan: 1,
          leftPct,
          widthPct: 100 - leftPct,
          zIndex,
        };
        return;
      }

      // Dense cluster: equal lanes. Expand colSpan rightward until a column
      // holds an overlapping item or the cluster's right edge is reached.
      let span = 1;
      for (let c = item.colIndex + 1; c < colCount; c++) {
        let blocked = false;
        for (const other of members) {
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
    });
  }

  return result;
}
