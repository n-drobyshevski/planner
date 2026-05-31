// Horizontal overlap packing for one day's TIMED items.
//
// Pure function: vertical placement (top/height from start/end) is handled
// elsewhere. This module only decides how overlapping intervals share the
// horizontal axis via columns and rightward column-spanning.
//
// Times are epoch milliseconds. Intervals are half-open [start, end):
// two intervals overlap iff a.start < b.end && b.start < a.end (touching
// endpoints do NOT overlap).

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
  /** number of columns this item spans rightward (>= 1) */
  colSpan: number;
  /** left offset as a percentage of the day width [0, 100] */
  leftPct: number;
  /** width as a percentage of the day width (0, 100] */
  widthPct: number;
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

    for (const item of members) {
      // Expand colSpan rightward: occupy columns to the right until a column
      // contains an item (in the same cluster) overlapping this one, or until
      // the cluster's right edge.
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

      const leftPct = (item.colIndex / colCount) * 100;
      const widthPct = (span / colCount) * 100;

      result[item.index] = {
        index: item.index,
        colIndex: item.colIndex,
        colCount,
        colSpan: span,
        leftPct,
        widthPct,
      };
    }
  }

  return result;
}
