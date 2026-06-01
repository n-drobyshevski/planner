"use client";

import { useMemo } from "react";
import { format, isSameDay } from "date-fns";
import { CalendarDays } from "lucide-react";
import { groupByDay } from "@/lib/calendar/agenda";
import { cn } from "@/lib/utils";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import type { Occurrence } from "@/lib/types";

interface Props {
  occurrences: Occurrence[];
  today: number;
  colorOf: (o: Occurrence) => string;
  selectedKey: string | null;
  onSelect: (o: Occurrence) => void;
  loading?: boolean;
}

/**
 * Chronological list of occurrences grouped by day — the phone-friendly
 * calendar view (big tap targets, vertical scroll, no dense grid). Reuses the
 * already-filtered + colored occurrences from the shell; tapping a row opens
 * the existing edit flow via `onSelect`.
 */
export function AgendaView({
  occurrences,
  today,
  colorOf,
  selectedKey,
  onSelect,
  loading,
}: Props) {
  const groups = useMemo(() => groupByDay(occurrences), [occurrences]);

  if (loading && groups.length === 0) return <AgendaSkeleton />;

  if (groups.length === 0) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <CalendarDays />
            </EmptyMedia>
            <EmptyTitle>Nothing scheduled</EmptyTitle>
            <EmptyDescription>
              Add an event with the New button, or jump to another date.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto overscroll-contain">
      <ol className="mx-auto max-w-2xl divide-y">
        {groups.map((g) => {
          const isToday = isSameDay(g.dayMs, today);
          return (
            <li key={g.dayMs} className="flex gap-3 px-3 py-3 sm:px-4">
              <div className="flex w-12 shrink-0 flex-col items-center pt-0.5">
                <span
                  className={cn(
                    "text-[11px] font-medium uppercase tracking-wide",
                    isToday ? "text-primary" : "text-muted-foreground",
                  )}
                >
                  {format(g.dayMs, "EEE")}
                </span>
                <span
                  className={cn(
                    "flex size-9 items-center justify-center rounded-full text-lg font-semibold tabular-nums",
                    isToday && "bg-primary text-primary-foreground",
                  )}
                >
                  {format(g.dayMs, "d")}
                </span>
                <span className="mt-0.5 text-[10px] text-muted-foreground">
                  {format(g.dayMs, "MMM")}
                </span>
              </div>

              <ul className="flex min-w-0 flex-1 flex-col gap-1.5">
                {g.items.map((o) => (
                  <li key={o.key}>
                    <button
                      type="button"
                      onClick={() => onSelect(o)}
                      aria-pressed={selectedKey === o.key}
                      className={cn(
                        "flex min-h-11 w-full items-center gap-3 rounded-lg border bg-card px-3 py-2 text-left shadow-soft transition-colors active:bg-accent",
                        selectedKey === o.key && "ring-2 ring-ring",
                      )}
                    >
                      <span
                        className="size-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: colorOf(o) }}
                        aria-hidden
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">
                          {o.title}
                        </span>
                        {o.location && (
                          <span className="block truncate text-xs text-muted-foreground">
                            {o.location}
                          </span>
                        )}
                      </span>
                      <span className="shrink-0 text-right text-xs text-muted-foreground tabular-nums">
                        {o.allDay ? "All day" : format(o.start, "h:mm a")}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function AgendaSkeleton() {
  return (
    <div className="mx-auto max-w-2xl space-y-4 p-4">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex gap-3">
          <Skeleton className="size-9 shrink-0 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-11 w-full rounded-lg" />
            {i % 2 === 0 && <Skeleton className="h-11 w-full rounded-lg" />}
          </div>
        </div>
      ))}
    </div>
  );
}
