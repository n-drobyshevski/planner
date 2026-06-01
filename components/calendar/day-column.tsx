"use client";

import { useMemo } from "react";
import { FolderPlus, FolderMinus, Pencil, Trash2 } from "lucide-react";
import { packDay } from "@/lib/layout/pack-day";
import { enclosingContext } from "@/lib/calendar/contexts";
import { msToY, durationToHeight, HOUR_PX } from "@/lib/datetime/grid-math";
import { EventBlock } from "./event-block";
import { ContextBackdrop } from "./context-backdrop";
import { NowLine } from "./now-line";
import { ItemContextMenu, type ItemAction } from "@/components/shared/item-context-menu";
import type { Occurrence } from "@/lib/types";

const DAY_MS = 86_400_000;
const HOURS = Array.from({ length: 24 }, (_, i) => i);
// Children that nest inside a context are indented so the context's tinted
// frame stays visible around them — that's what reads as "inside the zone".
const NEST_L = 14; // left gutter (px) exposing the context's accent edge
const NEST_R = 6; // right margin (px)

export function DayColumn({
  dayStart,
  occurrences,
  isToday,
  colorOf,
  selectedKey,
  onSelect,
  onChangeColor,
  onDeleteEvent,
  onAssignContext,
  onRemoveContext,
  taskDoneById,
  onToggleTaskDone,
}: {
  dayStart: number;
  occurrences: Occurrence[];
  isToday: boolean;
  colorOf: (o: Occurrence) => string;
  selectedKey: string | null;
  onSelect: (o: Occurrence) => void;
  onChangeColor: (o: Occurrence, color: string | null) => void;
  onDeleteEvent: (o: Occurrence) => void;
  onAssignContext?: (o: Occurrence, contextId: string) => void;
  onRemoveContext?: (o: Occurrence) => void;
  taskDoneById?: Map<string, boolean>;
  onToggleTaskDone?: (taskId: string) => void;
}) {
  const dayEnd = dayStart + DAY_MS;

  // Timed context backdrops — drawn behind the children, NOT packed.
  const contextSegs = useMemo(
    () =>
      occurrences
        .filter((o) => !o.allDay && o.kind === "context" && o.start < dayEnd && o.end > dayStart)
        .map((o) => ({
          occ: o,
          start: Math.max(o.start, dayStart),
          end: Math.min(o.end, dayEnd),
        })),
    [occurrences, dayStart, dayEnd],
  );

  // Timed children (normal events / task-blocks). ALL children are packed
  // together in one pass so overlapping events always share columns and never
  // collide — packing per-group would let a free and a nested event both claim
  // full width and overlap. `nestedFlags` (start inside a context) only drives a
  // small indent so the context's frame stays visible around its events.
  const { segments, packed, nestedFlags } = useMemo(() => {
    const ctxOccs = contextSegs.map((s) => s.occ);
    const segs = occurrences
      .filter((o) => !o.allDay && o.kind !== "context" && o.start < dayEnd && o.end > dayStart)
      .map((o) => ({
        occ: o,
        start: Math.max(o.start, dayStart),
        end: Math.min(o.end, dayEnd),
      }));
    const nested = segs.map((s) => enclosingContext(ctxOccs, s.occ.start) !== null);
    return { segments: segs, packed: packDay(segs), nestedFlags: nested };
  }, [occurrences, dayStart, dayEnd, contextSegs]);

  // Distinct contexts visible in this window, for the "Add to context" submenu.
  const contextChoices = useMemo(() => {
    const seen = new Map<string, string>();
    for (const o of occurrences) {
      if (o.kind === "context" && !seen.has(o.eventId)) seen.set(o.eventId, o.title);
    }
    return Array.from(seen, ([id, title]) => ({ id, title }));
  }, [occurrences]);

  function contextActions(occ: Occurrence): ItemAction[] {
    const actions: ItemAction[] = [];
    if (onAssignContext && contextChoices.length > 0) {
      const targets = contextChoices.filter((c) => c.id !== occ.contextId);
      if (targets.length > 0) {
        actions.push({
          label: "Add to context",
          icon: FolderPlus,
          submenu: targets.map((c) => ({
            label: c.title || "Untitled",
            onSelect: () => onAssignContext(occ, c.id),
          })),
        });
      }
    }
    if (onRemoveContext && occ.contextId) {
      actions.push({
        label: "Remove from context",
        icon: FolderMinus,
        onSelect: () => onRemoveContext(occ),
      });
    }
    return actions;
  }

  return (
    <div className="relative flex-1 border-l">
      {HOURS.map((h) => (
        <div
          key={h}
          style={{ height: HOUR_PX }}
          className="border-b border-border/40"
        />
      ))}

      {/* Context backdrops (z-0), behind the event blocks. */}
      {contextSegs.map((seg) => (
        <ItemContextMenu
          key={seg.occ.key}
          title={seg.occ.title}
          color={seg.occ.color}
          onColorChange={(c) => onChangeColor(seg.occ, c)}
          actions={[
            { label: "Edit", icon: Pencil, onSelect: () => onSelect(seg.occ) },
            {
              label: "Delete",
              icon: Trash2,
              destructive: true,
              onSelect: () => onDeleteEvent(seg.occ),
            },
          ]}
        >
          <ContextBackdrop
            occ={seg.occ}
            color={colorOf(seg.occ)}
            selected={selectedKey === seg.occ.key}
            style={{
              top: msToY(seg.start, dayStart),
              height: durationToHeight(seg.start, seg.end),
              left: 1,
              right: 1,
            }}
          />
        </ItemContextMenu>
      ))}

      {segments.map((seg, i) => {
        const p = packed[i];
        const taskId = seg.occ.taskId;
        // Nested children are indented within the column so the context's
        // tinted frame shows around them; free events keep the full width.
        const nested = nestedFlags[i];
        const left = nested
          ? `calc(${p.leftPct}% + ${NEST_L}px)`
          : `calc(${p.leftPct}% + 1px)`;
        const width = nested
          ? `calc(${p.widthPct}% - ${NEST_L + NEST_R}px)`
          : `calc(${p.widthPct}% - 3px)`;
        return (
          <ItemContextMenu
            key={seg.occ.key}
            title={seg.occ.title}
            color={seg.occ.color}
            onColorChange={(c) => onChangeColor(seg.occ, c)}
            actions={[
              { label: "Edit", icon: Pencil, onSelect: () => onSelect(seg.occ) },
              ...contextActions(seg.occ),
              {
                label: "Delete",
                icon: Trash2,
                destructive: true,
                onSelect: () => onDeleteEvent(seg.occ),
              },
            ]}
          >
            <EventBlock
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
                left,
                width,
              }}
            />
          </ItemContextMenu>
        );
      })}
      {isToday && <NowLine dayStart={dayStart} />}
    </div>
  );
}
