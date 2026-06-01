"use client";

import { useMemo } from "react";
import { FolderPlus, FolderMinus, Pencil, Trash2 } from "lucide-react";
import { packDay } from "@/lib/layout/pack-day";
import { msToY, durationToHeight, HOUR_PX } from "@/lib/datetime/grid-math";
import { EventBlock } from "./event-block";
import { ContextBackdrop } from "./context-backdrop";
import { NowLine } from "./now-line";
import { ItemContextMenu, type ItemAction } from "@/components/shared/item-context-menu";
import type { Occurrence } from "@/lib/types";

const DAY_MS = 86_400_000;
const HOURS = Array.from({ length: 24 }, (_, i) => i);

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

  // Timed children (normal events / task-blocks) — packed into columns as usual.
  const segments = useMemo(
    () =>
      occurrences
        .filter((o) => !o.allDay && o.kind !== "context" && o.start < dayEnd && o.end > dayStart)
        .map((o) => ({
          occ: o,
          start: Math.max(o.start, dayStart),
          end: Math.min(o.end, dayEnd),
        })),
    [occurrences, dayStart, dayEnd],
  );
  const packed = useMemo(() => packDay(segments), [segments]);

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
                left: `calc(${p.leftPct}% + 1px)`,
                width: `calc(${p.widthPct}% - 3px)`,
              }}
            />
          </ItemContextMenu>
        );
      })}
      {isToday && <NowLine dayStart={dayStart} />}
    </div>
  );
}
