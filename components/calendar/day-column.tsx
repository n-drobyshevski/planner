"use client";

import { useMemo } from "react";
import { packDay } from "@/lib/layout/pack-day";
import { msToY, durationToHeight, HOUR_PX } from "@/lib/datetime/grid-math";
import { EventBlock } from "./event-block";
import { NowLine } from "./now-line";
import type { Occurrence } from "@/lib/types";

const DAY_MS = 86_400_000;
const HOURS = Array.from({ length: 24 }, (_, i) => i);

export function DayColumn({
  dayStart,
  occurrences,
  isToday,
  colorOf,
  selectedKey,
  taskDoneById,
  onToggleTaskDone,
}: {
  dayStart: number;
  occurrences: Occurrence[];
  isToday: boolean;
  colorOf: (o: Occurrence) => string;
  selectedKey: string | null;
  taskDoneById?: Map<string, boolean>;
  onToggleTaskDone?: (taskId: string) => void;
}) {
  const dayEnd = dayStart + DAY_MS;

  const segments = useMemo(
    () =>
      occurrences
        .filter((o) => !o.allDay && o.start < dayEnd && o.end > dayStart)
        .map((o) => ({
          occ: o,
          start: Math.max(o.start, dayStart),
          end: Math.min(o.end, dayEnd),
        })),
    [occurrences, dayStart, dayEnd],
  );
  const packed = useMemo(() => packDay(segments), [segments]);

  return (
    <div className="relative flex-1 border-l">
      {HOURS.map((h) => (
        <div
          key={h}
          style={{ height: HOUR_PX }}
          className="border-b border-border/40"
        />
      ))}
      {segments.map((seg, i) => {
        const p = packed[i];
        const taskId = seg.occ.taskId;
        return (
          <EventBlock
            key={seg.occ.key}
            occ={seg.occ}
            color={colorOf(seg.occ)}
            selected={selectedKey === seg.occ.key}
            taskDone={taskId ? taskDoneById?.get(taskId) ?? false : undefined}
            onToggleTaskDone={
              taskId && onToggleTaskDone
                ? () => onToggleTaskDone(taskId)
                : undefined
            }
            style={{
              top: msToY(seg.start, dayStart),
              height: durationToHeight(seg.start, seg.end),
              left: `calc(${p.leftPct}% + 1px)`,
              width: `calc(${p.widthPct}% - 3px)`,
            }}
          />
        );
      })}
      {isToday && <NowLine dayStart={dayStart} />}
    </div>
  );
}
