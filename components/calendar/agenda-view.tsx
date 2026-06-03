"use client";

import { forwardRef, useMemo } from "react";
import { format, isSameDay } from "date-fns";
import { tz } from "@date-fns/tz";
import { formatTime } from "@/lib/datetime/format";
import { useViewerTimeZone } from "@/lib/datetime/timezone-context";
import { CalendarDays, Pencil, Trash2, Eye } from "lucide-react";
import { groupByDay } from "@/lib/calendar/agenda";
import { cn } from "@/lib/utils";
import { toPaletteColor } from "@/lib/theme/appearance";
import { useUiStore } from "@/stores/ui-store";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ItemContextMenu,
  ItemMenuButton,
  type MenuableProps,
  type ItemAction,
} from "@/components/shared/item-context-menu";
import type { Occurrence } from "@/lib/types";

interface Props {
  occurrences: Occurrence[];
  today: number;
  colorOf: (o: Occurrence) => string;
  selectedKey: string | null;
  onSelect: (o: Occurrence) => void;
  onChangeColor: (o: Occurrence, color: string | null) => void;
  onDeleteEvent: (o: Occurrence) => void;
  /** Builds the "Share / Make personal" menu action for an event (null = N/A). */
  eventShareAction?: (o: Occurrence) => ItemAction | null;
  /** Builds the "Copy to my calendar" menu action for another member's event (null = N/A). */
  eventCopyAction?: (o: Occurrence) => ItemAction | null;
  /** Owner-only editability; non-editable occurrences are read-only overlays. */
  canEdit: (o: Occurrence) => boolean;
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
  onChangeColor,
  onDeleteEvent,
  eventShareAction,
  eventCopyAction,
  canEdit,
  loading,
}: Props) {
  const timeZone = useViewerTimeZone();
  const groups = useMemo(() => groupByDay(occurrences, timeZone), [occurrences, timeZone]);

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
          const isToday = isSameDay(g.dayMs, today, { in: tz(timeZone) });
          return (
            <li key={g.dayMs} className="flex gap-3 px-3 py-3 sm:px-4">
              <div className="flex w-12 shrink-0 flex-col items-center pt-0.5">
                <span
                  className={cn(
                    "text-[11px] font-medium uppercase tracking-wide",
                    isToday ? "text-primary" : "text-muted-foreground",
                  )}
                >
                  {format(g.dayMs, "EEE", { in: tz(timeZone) })}
                </span>
                <span
                  className={cn(
                    "flex size-9 items-center justify-center rounded-full text-lg font-semibold tabular-nums",
                    isToday && "bg-primary text-primary-foreground",
                  )}
                >
                  {format(g.dayMs, "d", { in: tz(timeZone) })}
                </span>
                <span className="mt-0.5 text-[10px] text-muted-foreground">
                  {format(g.dayMs, "MMM", { in: tz(timeZone) })}
                </span>
              </div>

              <ul className="flex min-w-0 flex-1 flex-col gap-1.5">
                {g.items.map((o) => (
                  <li key={o.key}>
                    <ItemContextMenu
                      title={o.title}
                      color={canEdit(o) ? o.color : undefined}
                      onColorChange={canEdit(o) ? (c) => onChangeColor(o, c) : undefined}
                      actions={
                        canEdit(o)
                          ? [
                              { label: "Edit", icon: Pencil, onSelect: () => onSelect(o) },
                              ...(eventShareAction && eventShareAction(o)
                                ? [eventShareAction(o)!]
                                : []),
                              {
                                label: "Delete",
                                icon: Trash2,
                                destructive: true,
                                onSelect: () => onDeleteEvent(o),
                              },
                            ]
                          : [
                              { label: "Open", icon: Eye, onSelect: () => onSelect(o) },
                              ...(eventCopyAction && eventCopyAction(o)
                                ? [eventCopyAction(o)!]
                                : []),
                            ]
                      }
                    >
                      <AgendaRow
                        occ={o}
                        color={colorOf(o)}
                        selected={selectedKey === o.key}
                        onSelect={() => onSelect(o)}
                      />
                    </ItemContextMenu>
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

/**
 * One agenda row. A div (not a button) so it can host the ⋮ menu button on
 * mobile without nesting interactive elements; keyboard-activatable via Enter/
 * Space. Forwards ref/props so it can be a ContextMenu trigger on desktop.
 */
const AgendaRow = forwardRef<
  HTMLDivElement,
  {
    occ: Occurrence;
    color: string;
    selected: boolean;
    onSelect: () => void;
  } & MenuableProps &
    Omit<React.HTMLAttributes<HTMLDivElement>, "onSelect">
>(function AgendaRow({ occ, color, selected, onSelect, onMenu, className, ...rest }, ref) {
  const timeZone = useViewerTimeZone();
  const maskTitles = useUiStore((s) => s.maskTitles);
  return (
    <div
      ref={ref}
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect();
        }
      }}
      aria-pressed={selected}
      className={cn(
        "flex min-h-11 w-full cursor-pointer items-center gap-3 rounded-lg border bg-card px-3 py-2 text-left shadow-soft transition-colors active:bg-accent",
        selected && "ring-2 ring-ring",
        occ.inactive && "evt-inactive",
        occ.status === "planned" && "evt-planned",
        occ.status === "cancelled" && "opacity-55",
        className,
      )}
      {...rest}
    >
      <span
        className="size-2.5 shrink-0 rounded-full"
        style={{ backgroundColor: toPaletteColor(color) }}
        aria-hidden
      />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span
            className={cn(
              "truncate font-medium",
              occ.status === "cancelled" && "line-through",
              maskTitles && "blur-[5px] select-none",
            )}
          >
            {occ.title}
          </span>
          {occ.kind === "context" && (
            <span className="shrink-0 rounded-full border px-1.5 py-px text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              Context
            </span>
          )}
        </span>
        {occ.location && (
          <span className="block truncate text-xs text-muted-foreground">
            {occ.location}
          </span>
        )}
      </span>
      <span className="shrink-0 text-right text-xs text-muted-foreground tabular-nums">
        {occ.allDay ? "All day" : formatTime(occ.start, timeZone)}
      </span>
      {onMenu && (
        <ItemMenuButton onMenu={onMenu} className="-mr-1 text-muted-foreground" />
      )}
    </div>
  );
});

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
