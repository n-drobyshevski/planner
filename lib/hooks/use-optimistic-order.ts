"use client";

import { useState, type Dispatch, type SetStateAction } from "react";

/**
 * A local copy of a server-derived value that resyncs whenever the source
 * changes — unless `hold` is set (e.g. mid-drag), so an optimistic reorder set
 * by the caller survives until the refetch/realtime row catches up. The sync
 * happens during render (React's "adjust state on prop change" pattern), not
 * in an effect, so a fresh source never paints one frame stale.
 *
 * `isEqual` decides what counts as a change; pass a value comparison (e.g.
 * ids join) when the source is recomputed each render with the same content.
 */
export function useOptimisticOrder<T>(
  source: T,
  hold: boolean,
  isEqual: (a: T, b: T) => boolean = Object.is,
): [T, Dispatch<SetStateAction<T>>] {
  const [value, setValue] = useState(source);
  const [synced, setSynced] = useState(source);
  if (!isEqual(source, synced) && !hold) {
    setSynced(source);
    setValue(source);
  }
  return [value, setValue];
}
