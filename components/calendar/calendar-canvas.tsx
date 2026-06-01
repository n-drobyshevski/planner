"use client";

import { useMemo } from "react";
import { startOfDay } from "date-fns";
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
  onSelect: (o: Occurrence) => void;
  onPickDay: (ms: number) => void;
  onCreateRange: (startMs: number, endMs: number) => void;
  /** Month-view: create an event on a whole day (empty-cell click). */
  onCreateDay: (ms: number) => void;
  onReschedule: (occ: Occurrence, startMs: number, endMs: number) => void;
  onChangeColor: (occ: Occurrence, color: string | null) => void;
  onDeleteEvent: (occ: Occurrence) => void;
  onAssignContext?: (occ: Occurrence, contextId: string) => void;
  onRemoveContext?: (occ: Occurrence) => void;
  /** Whether an occurrence is editable (owner-only); others are read-only overlays. */
  canEdit?: (o: Occurrence) => boolean;
  taskDoneById?: Map<string, boolean>;
  onToggleTaskDone?: (taskId: string) => void;
  onScheduleTask?: (taskId: string, startMs: number, endMs: number) => void;
  loading: boolean;
  error: boolean;
}

const ALWAYS_EDITABLE = () => true;

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
    error,
  } = props;
  const today = useMemo(() => startOfDay(new Date()).getTime(), []);

  // The month grid's tiny cells can't show a time-block backdrop usefully, so
  // contexts are filtered out there. Agenda keeps them (as badged rows).
  const monthOccurrences = useMemo(
    () => occurrences.filter((o) => o.kind !== "context"),
    [occurrences],
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
      selectedKey={selectedKey}
      onSelect={onSelect}
      onCreateRange={onCreateRange}
      onReschedule={onReschedule}
      onChangeColor={onChangeColor}
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
