"use client";

import { useMemo } from "react";
import { startOfDay, getTime } from "date-fns";
import { tz } from "@date-fns/tz";
import { useViewerTimeZone } from "@/lib/datetime/timezone-context";
import { TimeGrid } from "./time-grid";
import { MonthGrid } from "./month-grid";
import { AgendaView } from "./agenda-view";
import type { CalendarView, Occurrence } from "@/lib/types";

export interface CanvasProps {
  view: CalendarView;
  days: number[];
  occurrences: Occurrence[];
  focusedMs: number;
  colorOf: (o: Occurrence) => string;
  selectedKey: string | null;
  /** Multi-selection set (time-grid views); drives the ring highlight + bulk ops. */
  selectedKeys?: Set<string>;
  onSelect: (o: Occurrence) => void;
  /** Time-grid: Shift+click toggles an occurrence in/out of the multi-selection. */
  onToggleSelect?: (o: Occurrence) => void;
  /** Time-grid: empty-space click clears the multi-selection. */
  onClearSelection?: () => void;
  onPickDay: (ms: number) => void;
  onCreateRange: (startMs: number, endMs: number) => void;
  /** Month-view: create an event on a whole day (empty-cell click). */
  onCreateDay: (ms: number) => void;
  onReschedule: (occ: Occurrence, startMs: number, endMs: number) => void;
  /** Time-grid: move several selected blocks together. */
  onRescheduleMany?: (moves: { occ: Occurrence; start: number; end: number }[]) => void;
  /** Time-grid: Ctrl/Cmd-drag drops a one-off copy. */
  onDuplicate?: (occ: Occurrence, startMs: number, endMs: number) => void;
  onChangeColor: (occ: Occurrence, color: string | null) => void;
  /** Time-grid: recolor the whole multi-selection. */
  onColorSelected?: (color: string | null) => void;
  onDeleteEvent: (occ: Occurrence) => void;
  onAssignContext?: (occ: Occurrence, contextId: string) => void;
  onRemoveContext?: (occ: Occurrence) => void;
  /** Whether an occurrence is editable (owner-only); others are read-only overlays. */
  canEdit?: (o: Occurrence) => boolean;
  taskDoneById?: Map<string, boolean>;
  onToggleTaskDone?: (taskId: string) => void;
  onScheduleTask?: (taskId: string, startMs: number, endMs: number) => void;
  /** Month-view only: when false, inactive (grayed-out) events are hidden there. */
  showInactiveInMonth?: boolean;
  loading: boolean;
  error: boolean;
}

const ALWAYS_EDITABLE = () => true;
const EMPTY_SET: Set<string> = new Set();
const NOOP = () => {};

export function CalendarCanvas(props: CanvasProps) {
  const {
    view,
    days,
    occurrences,
    focusedMs,
    colorOf,
    selectedKey,
    onSelect,
    onPickDay,
    onCreateRange,
    onCreateDay,
    onReschedule,
    onChangeColor,
    onDeleteEvent,
    onAssignContext,
    onRemoveContext,
    canEdit = ALWAYS_EDITABLE,
    taskDoneById,
    onToggleTaskDone,
    onScheduleTask,
    showInactiveInMonth = true,
    error,
  } = props;
  const timeZone = useViewerTimeZone();
  // "Today" is the viewer-zone day, so the highlight + now-line land on the
  // right column even when the chosen zone differs from the device.
  const today = useMemo(
    () => getTime(startOfDay(Date.now(), { in: tz(timeZone) })),
    [timeZone],
  );

  // The month grid's tiny cells can't show a time-block backdrop usefully, so
  // contexts are filtered out there. Agenda keeps them (as badged rows).
  // Inactive (grayed-out) events are optionally hidden here too, per the
  // member's preference, to keep the cramped cells legible.
  const monthOccurrences = useMemo(
    () =>
      occurrences.filter(
        (o) => o.kind !== "context" && (showInactiveInMonth || !o.inactive),
      ),
    [occurrences, showInactiveInMonth],
  );

  if (error) {
    return (
      <Centered>
        Couldn&apos;t load your calendar. Make sure the database schema is applied
        and seeded.
      </Centered>
    );
  }

  if (view === "agenda") {
    return (
      <AgendaView
        occurrences={occurrences}
        today={today}
        colorOf={colorOf}
        selectedKey={selectedKey}
        onSelect={onSelect}
        onChangeColor={onChangeColor}
        onDeleteEvent={onDeleteEvent}
        canEdit={canEdit}
        loading={props.loading}
      />
    );
  }

  if (view === "month") {
    return (
      <MonthGrid
        days={days}
        occurrences={monthOccurrences}
        today={today}
        focusedMs={focusedMs}
        colorOf={colorOf}
        selectedKey={selectedKey}
        onSelect={onSelect}
        onPickDay={onPickDay}
        onCreateDay={onCreateDay}
        onChangeColor={onChangeColor}
        onDeleteEvent={onDeleteEvent}
        canEdit={canEdit}
      />
    );
  }

  return (
    <TimeGrid
      days={days}
      occurrences={occurrences}
      today={today}
      colorOf={colorOf}
      selectedKeys={props.selectedKeys ?? EMPTY_SET}
      onSelect={onSelect}
      onToggleSelect={props.onToggleSelect ?? NOOP}
      onClearSelection={props.onClearSelection ?? NOOP}
      onCreateRange={onCreateRange}
      onReschedule={onReschedule}
      onRescheduleMany={props.onRescheduleMany ?? NOOP}
      onDuplicate={props.onDuplicate ?? NOOP}
      onChangeColor={onChangeColor}
      onColorSelected={props.onColorSelected ?? NOOP}
      onDeleteEvent={onDeleteEvent}
      onAssignContext={onAssignContext}
      onRemoveContext={onRemoveContext}
      canEdit={canEdit}
      taskDoneById={taskDoneById}
      onToggleTaskDone={onToggleTaskDone}
      onScheduleTask={onScheduleTask}
    />
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-full items-center justify-center p-8 text-center text-sm text-muted-foreground">
      <p className="max-w-xs">{children}</p>
    </div>
  );
}
