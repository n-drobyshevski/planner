"use client";

import { useMemo, useRef, useState } from "react";
import { format } from "date-fns";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import {
  HOUR_PX,
  SLOT_MIN,
  minutesToY,
  yToMinutes,
  snapMinutes,
} from "@/lib/datetime/grid-math";
import { DayColumn } from "./day-column";
import type { Occurrence } from "@/lib/types";

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const DAY_MS = 86_400_000;
const MIN_NEW = 30; // minimum minutes for a drag-created event

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
const clampMin = (m: number) => clamp(m, 0, 1440);

interface Props {
  days: number[];
  occurrences: Occurrence[];
  today: number;
  colorOf: (o: Occurrence) => string;
  selectedKey: string | null;
  onSelect: (o: Occurrence) => void;
  onCreateRange: (startMs: number, endMs: number) => void;
  onReschedule: (occ: Occurrence, startMs: number, endMs: number) => void;
  taskDoneById?: Map<string, boolean>;
  onToggleTaskDone?: (taskId: string) => void;
  /** Drop a backlog task onto a slot to schedule a default 1h block. */
  onScheduleTask?: (taskId: string, startMs: number, endMs: number) => void;
}

const SCHED_MIN = 60; // default minutes for a task dropped onto the grid

interface Drag {
  kind: "create" | "move" | "resize";
  pointerId: number;
  startX: number;
  startY: number;
  moved: boolean;
  dayIndex: number;
  // create
  anchorMin?: number;
  curMin?: number;
  // move
  occKey?: string;
  durationMin?: number;
  grabMin?: number;
  startMin?: number;
  curDayIndex?: number;
  curStartMin?: number;
  // resize
  edge?: "start" | "end";
  endMin?: number;
  curStart?: number;
  curEnd?: number;
}

interface Preview {
  dayIndex: number;
  topMin: number;
  heightMin: number;
  label: string;
}

export function TimeGrid({
  days,
  occurrences,
  today,
  colorOf,
  selectedKey,
  onSelect,
  onCreateRange,
  onReschedule,
  taskDoneById,
  onToggleTaskDone,
  onScheduleTask,
}: Props) {
  const colsRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<Drag | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);

  const allDay = occurrences.filter((o) => o.allDay);
  const byKey = useMemo(
    () => new Map(occurrences.map((o) => [o.key, o])),
    [occurrences],
  );

  function geom(clientX: number, clientY: number) {
    const rect = colsRef.current!.getBoundingClientRect();
    const colW = rect.width / days.length;
    const dayIndex = clamp(Math.floor((clientX - rect.left) / colW), 0, days.length - 1);
    const minutes = yToMinutes(clientY - rect.top);
    return { dayIndex, minutes };
  }

  const minutesIn = (ms: number, dayIndex: number) => (ms - days[dayIndex]) / 60_000;
  const dayIndexOfMs = (ms: number) => {
    for (let i = 0; i < days.length; i++) {
      if (ms >= days[i] && ms < days[i] + DAY_MS) return i;
    }
    return ms < days[0] ? 0 : days.length - 1;
  };
  const timeLabel = (dayIndex: number, min: number) =>
    format(days[dayIndex] + min * 60_000, "h:mm");

  function onPointerDown(e: React.PointerEvent) {
    if (e.button !== 0) return;
    const el = e.target as HTMLElement;
    const handle = el.closest<HTMLElement>("[data-resize]");
    const blockEl = el.closest<HTMLElement>("[data-occ-key]");
    const g = geom(e.clientX, e.clientY);
    colsRef.current?.setPointerCapture(e.pointerId);

    if (handle && blockEl) {
      const occ = byKey.get(blockEl.dataset.occKey!);
      if (!occ) return;
      const dayIndex = dayIndexOfMs(occ.start);
      dragRef.current = {
        kind: "resize",
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        moved: false,
        dayIndex,
        occKey: occ.key,
        edge: (handle.dataset.resize as "start" | "end") ?? "end",
        startMin: minutesIn(occ.start, dayIndex),
        endMin: minutesIn(occ.end, dayIndex),
      };
    } else if (blockEl) {
      const occ = byKey.get(blockEl.dataset.occKey!);
      if (!occ) return;
      const dayIndex = dayIndexOfMs(occ.start);
      const sMin = minutesIn(occ.start, dayIndex);
      dragRef.current = {
        kind: "move",
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        moved: false,
        dayIndex,
        occKey: occ.key,
        durationMin: (occ.end - occ.start) / 60_000,
        grabMin: g.minutes - sMin,
        startMin: sMin,
        curDayIndex: dayIndex,
        curStartMin: sMin,
      };
    } else {
      const anchorMin = snapMinutes(clampMin(g.minutes));
      dragRef.current = {
        kind: "create",
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        moved: false,
        dayIndex: g.dayIndex,
        anchorMin,
        curMin: anchorMin,
      };
    }
  }

  function onPointerMove(e: React.PointerEvent) {
    const d = dragRef.current;
    if (!d || e.pointerId !== d.pointerId) return;
    if (!d.moved && (Math.abs(e.clientX - d.startX) > 4 || Math.abs(e.clientY - d.startY) > 4)) {
      d.moved = true;
    }
    const g = geom(e.clientX, e.clientY);

    if (d.kind === "create") {
      d.curMin = snapMinutes(clampMin(g.minutes));
      const top = Math.min(d.anchorMin!, d.curMin);
      const bot = Math.max(d.anchorMin!, d.curMin);
      setPreview({
        dayIndex: d.dayIndex,
        topMin: top,
        heightMin: Math.max(bot - top, SLOT_MIN),
        label: `${timeLabel(d.dayIndex, top)} – ${timeLabel(d.dayIndex, Math.max(bot, top + SLOT_MIN))}`,
      });
    } else if (d.kind === "move") {
      const dur = d.durationMin!;
      const newStart = clamp(snapMinutes(g.minutes - d.grabMin!), 0, 1440 - dur);
      d.curDayIndex = g.dayIndex;
      d.curStartMin = newStart;
      setPreview({
        dayIndex: g.dayIndex,
        topMin: newStart,
        heightMin: dur,
        label: byKey.get(d.occKey!)?.title ?? "",
      });
    } else {
      const m = snapMinutes(clampMin(g.minutes));
      if (d.edge === "start") {
        d.curStart = Math.min(m, d.endMin! - SLOT_MIN);
        setPreview({ dayIndex: d.dayIndex, topMin: d.curStart, heightMin: d.endMin! - d.curStart, label: "" });
      } else {
        d.curEnd = Math.max(m, d.startMin! + SLOT_MIN);
        setPreview({ dayIndex: d.dayIndex, topMin: d.startMin!, heightMin: d.curEnd - d.startMin!, label: "" });
      }
    }
  }

  function onPointerUp(e: React.PointerEvent) {
    const d = dragRef.current;
    if (!d || e.pointerId !== d.pointerId) return;
    dragRef.current = null;
    setPreview(null);
    try {
      colsRef.current?.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }

    if (d.kind === "create") {
      if (!d.moved) return;
      const top = Math.min(d.anchorMin!, d.curMin!);
      const bot = Math.max(d.anchorMin!, d.curMin!);
      const end = Math.max(bot, top + MIN_NEW);
      onCreateRange(days[d.dayIndex] + top * 60_000, days[d.dayIndex] + end * 60_000);
    } else if (d.kind === "move") {
      const occ = byKey.get(d.occKey!);
      if (!occ) return;
      if (!d.moved || d.durationMin! > 1440) {
        onSelect(occ);
        return;
      }
      const start = days[d.curDayIndex!] + d.curStartMin! * 60_000;
      onReschedule(occ, start, start + d.durationMin! * 60_000);
    } else {
      const occ = byKey.get(d.occKey!);
      if (!occ) return;
      if (!d.moved) {
        onSelect(occ);
        return;
      }
      if (d.edge === "start") {
        onReschedule(occ, days[d.dayIndex] + d.curStart! * 60_000, occ.end);
      } else {
        onReschedule(occ, occ.start, days[d.dayIndex] + d.curEnd! * 60_000);
      }
    }
  }

  // --- Drop a backlog task onto the grid (HTML5 DnD, separate from the
  // pointer-based move/resize above) ---
  function dropSlot(clientX: number, clientY: number) {
    const g = geom(clientX, clientY);
    const start = clamp(snapMinutes(clampMin(g.minutes)), 0, 1440 - SCHED_MIN);
    return { dayIndex: g.dayIndex, startMin: start };
  }
  function onDragOver(e: React.DragEvent) {
    if (!onScheduleTask) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    const { dayIndex, startMin } = dropSlot(e.clientX, e.clientY);
    setPreview({
      dayIndex,
      topMin: startMin,
      heightMin: SCHED_MIN,
      label: `${timeLabel(dayIndex, startMin)} – ${timeLabel(dayIndex, startMin + SCHED_MIN)}`,
    });
  }
  function onDrop(e: React.DragEvent) {
    if (!onScheduleTask) return;
    e.preventDefault();
    const taskId =
      e.dataTransfer.getData("text/task-id") || e.dataTransfer.getData("text/plain");
    setPreview(null);
    if (!taskId) return;
    const { dayIndex, startMin } = dropSlot(e.clientX, e.clientY);
    const startMs = days[dayIndex] + startMin * 60_000;
    onScheduleTask(taskId, startMs, startMs + SCHED_MIN * 60_000);
  }

  return (
    <div className="flex h-full flex-col">
      {/* Day headers */}
      <div className="flex border-b pr-3">
        <div className="w-14 shrink-0" />
        {days.map((d) => (
          <div key={d} className="flex-1 border-l py-2 text-center">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">
              {format(d, "EEE")}
            </div>
            <div
              className={cn(
                "mx-auto mt-0.5 flex size-8 items-center justify-center rounded-full text-base font-semibold tabular-nums",
                d === today && "bg-primary text-primary-foreground",
              )}
            >
              {format(d, "d")}
            </div>
          </div>
        ))}
      </div>

      {/* All-day strip */}
      {allDay.length > 0 && (
        <div className="flex border-b bg-muted/30 pr-3">
          <div className="flex w-14 shrink-0 items-start justify-end p-1 text-[10px] uppercase text-muted-foreground">
            All-day
          </div>
          {days.map((d) => {
            const items = allDay.filter((o) => o.start < d + DAY_MS && o.end > d);
            return (
              <div key={d} className="flex min-w-0 flex-1 flex-col gap-1 border-l p-1">
                {items.map((o) => (
                  <button
                    key={o.key}
                    type="button"
                    onClick={() => onSelect(o)}
                    style={{ backgroundColor: colorOf(o) }}
                    className={cn(
                      "truncate rounded px-1.5 py-0.5 text-left text-xs font-medium text-white",
                      selectedKey === o.key && "ring-2 ring-foreground",
                    )}
                  >
                    {o.title}
                  </button>
                ))}
              </div>
            );
          })}
        </div>
      )}

      {/* Scrollable time grid */}
      <ScrollArea className="min-h-0 flex-1">
        <div className="flex" style={{ height: HOUR_PX * 24 }}>
          <div className="w-14 shrink-0">
            {HOURS.map((h) => (
              <div key={h} style={{ height: HOUR_PX }} className="relative">
                <span className="absolute -top-2 right-2 text-xs text-muted-foreground tabular-nums">
                  {h === 0 ? "" : format(new Date(2000, 0, 1, h), "h a")}
                </span>
              </div>
            ))}
          </div>

          <div
            ref={colsRef}
            className="relative flex flex-1 touch-none"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={() => {
              dragRef.current = null;
              setPreview(null);
            }}
            onDragOver={onDragOver}
            onDrop={onDrop}
            onDragLeave={() => setPreview(null)}
          >
            {days.map((d) => (
              <DayColumn
                key={d}
                dayStart={d}
                isToday={d === today}
                occurrences={occurrences}
                colorOf={colorOf}
                selectedKey={selectedKey}
                taskDoneById={taskDoneById}
                onToggleTaskDone={onToggleTaskDone}
              />
            ))}

            {preview && (
              <div
                className="pointer-events-none absolute z-30 overflow-hidden rounded-md border-2 border-dashed border-primary bg-primary/20 px-1"
                style={{
                  left: `calc(${(preview.dayIndex / days.length) * 100}% + 2px)`,
                  width: `calc(${100 / days.length}% - 4px)`,
                  top: minutesToY(preview.topMin),
                  height: Math.max(minutesToY(preview.heightMin), 6),
                }}
              >
                <span className="truncate text-xs font-medium text-primary">
                  {preview.label}
                </span>
              </div>
            )}
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}
