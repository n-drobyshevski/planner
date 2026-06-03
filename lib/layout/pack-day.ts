// Horizontal overlap packing for one day's TIMED items.
//
// Pure function: vertical placement (top/height from start/end) is handled
// elsewhere. This module only decides how overlapping intervals share the
// horizontal axis.
//
// Owner-anchored lanes: an overlapping cluster (2+ transitively-overlapping
// items) is split by owner into two lanes, each 3/4 of the day width. "Mine"
// items (`mine` truthy) anchor to the LEFT border (0–75%); the other person's
// items anchor to the RIGHT border (25–100%). The lanes overlap in the middle
// 50%, so the two calendars stay visually separated yet each readable. A
// single (non-overlapping) item always keeps the full width.
//
// Within each lane, the same two strategies as before lay the side's items out,
// then the result is scaled into the lane:
//   • Cascade (small lanes, <= CASCADE_MAX columns): every block extends to the
//     lane's right edge and is staggered right by a fixed step, layered by
//     z-index. The front block stays fully readable and earlier blocks peek out
//     on the left. Because blocks differ only by left offset + z, revealing a
//     covered block is a pure z-index change (no layout/animation).
//   • Split (dense lanes): equal side-by-side columns with rightward span fill
//     (the classic non-overlapping tiling), so crowded slots stay legible.
// z-index follows start time across the WHOLE cluster (later start sits in
// front), so mine/other blocks interleave correctly where the lanes overlap.
//
// Times are epoch milliseconds. Intervals are half-open [start, end):
// two intervals overlap iff a.start < b.end && b.start < a.end (touching
// endpoints do NOT overlap).

// Clusters with at most this many columns cascade; denser ones tile (split).
const CASCADE_MAX = 4;
// Per-column horizontal stagger cap (% of LANE width — i.e. relative scale).
const MAX_STEP_PCT = 28;
// Total stagger cap (% of LANE width) → the front block keeps >= ~55% of its
// lane. Applied on the relative [0,100] scale before the lane is shrunk to 75%.
const MAX_OFFSET_PCT = 45;
// Resting z-index of an event block (must match event-block.tsx's z-[var(--evt-z,10)]).
const BASE_Z = 10;
// Stay below the selected/hover layer (z-30) so those always win.
const MAX_Z = 29;
// Each owner lane is 3/4 of the day-column width.
const LANE_WIDTH_PCT = 75;
// The other person's lane is right-anchored: 25%–100%. Mine is left at 0%.
const OTHER_LANE_LEFT_PCT = 25;

export interface LayoutInterval {
  start: number;
  end: number;
  /** Owner-anchored side: truthy = mine (left lane), false = the other person's
   *  (right lane). Absent is treated as mine. */
  mine?: boolean;
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
  /** owner side: true = mine (left lane), false = the other person's (right) */
  mine: boolean;
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
    mine: it.mine ?? true,
  }));
  work.sort((a, b) => {
    if (a.start !== b.start) return a.start - b.start;
    return b.end - a.end;
  });

  // Partition into clusters of transitively-overlapping items. Because the
  // list is sorted by start, a new cluster begins whenever an item's start is
  // at or beyond the maximum end seen so far in the current cluster. (Column
  // assignment is done later, per owner-lane, so mine/other never share one.)
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
    // z follows start order across the WHOLE cluster (both lanes), so where the
    // mine/other lanes overlap in the middle the later-starting block wins.
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

    // Overlapping cluster: split by owner into two 3/4 lanes (mine left,
    // other right). Each side is laid out independently and scaled into its
    // lane. Empty subgroups are a no-op (that lane simply stays empty).
    layoutLane(
      members.filter((m) => m.mine),
      0,
      LANE_WIDTH_PCT,
      result,
      zByIndex,
    );
    layoutLane(
      members.filter((m) => !m.mine),
      OTHER_LANE_LEFT_PCT,
      LANE_WIDTH_PCT,
      result,
      zByIndex,
    );
  }

  return result;
}

/**
 * Lay out one owner-side's overlapping items (greedy columns + cascade/split),
 * then map the relative [0,100] geometry into the lane [laneLeftPct,
 * laneLeftPct + laneWidthPct]. Writes into `result` by original index, using
 * the cluster-wide `zByIndex` for stacking.
 */
function layoutLane(
  group: Working[],
  laneLeftPct: number,
  laneWidthPct: number,
  result: PackedColumn[],
  zByIndex: Map<number, number>,
): void {
  if (group.length === 0) return;

  // Greedy column assignment WITHIN this lane only: place each item in the
  // first column whose last placed item does not overlap it; else open one.
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

  const colCount = group.reduce((m, it) => Math.max(m, it.colIndex), 0) + 1;
  const cascade = colCount <= CASCADE_MAX;
  // Per-column stagger (relative scale), capped so the total offset never eats
  // more than MAX_OFFSET_PCT of the lane (keeps the front block readable).
  const stepPct = cascade
    ? Math.min(MAX_STEP_PCT, MAX_OFFSET_PCT / Math.max(1, colCount - 1))
    : 0;

  // Map a relative [0,100] left/width into the lane.
  const toLaneLeft = (rel: number) => laneLeftPct + (rel * laneWidthPct) / 100;
  const toLaneWidth = (rel: number) => (rel * laneWidthPct) / 100;

  for (const item of group) {
    const zIndex = zByIndex.get(item.index)!;

    if (cascade) {
      // Stagger right by column; every block runs to the lane's right edge,
      // so blocks differ only by left offset + z-index.
      const relLeft = item.colIndex * stepPct;
      result[item.index] = {
        index: item.index,
        colIndex: item.colIndex,
        colCount,
        colSpan: 1,
        leftPct: toLaneLeft(relLeft),
        widthPct: toLaneWidth(100 - relLeft),
        zIndex,
      };
      continue;
    }

    // Dense lane: equal columns. Expand colSpan rightward until a column holds
    // an overlapping item (in this lane) or the lane's right edge is reached.
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
      leftPct: toLaneLeft((item.colIndex / colCount) * 100),
      widthPct: toLaneWidth((span / colCount) * 100),
      zIndex,
    };
  }
}
