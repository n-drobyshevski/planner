"use client";

import { forwardRef, useMemo } from "react";
import { format, isSameMonth } from "date-fns";
import { Pencil, Trash2, Eye } from "lucide-react";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { ItemContextMenu } from "@/components/shared/item-context-menu";
import { packMonthWeek, occurrencesOnDay, type MonthItem } from "@/lib/layout/pack-month";
import type { Occurrence } from "@/lib/types";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MAX_LANES = 3;
const DAY_HEADER_PX = 28;
const LANE_PX = 20;

interface CommonProps {
  occurrences: Occurrence[];
  today: number;
  focusedMs: number;
  colorOf: (o: Occurrence) => string;
  selectedKey: string | null;
  onSelect: (o: Occurrence) => void;
  onPickDay: (ms: number) => void;
  onChangeColor: (o: Occurrence, color: string | null) => void;
  onDeleteEvent: (o: Occurrence) => void;
  /** Owner-only editability; non-editable occurrences are read-only overlays. */
  canEdit: (o: Occurrence) => boolean;
}

export function MonthGrid({
  days,
  ...rest
}: CommonProps & { days: number[] }) {
  const weeks = useMemo(() => {
    const w: number[][] = [];
    for (let i = 0; i < days.length; i += 7) w.push(days.slice(i, i + 7));
    return w;
  }, [days]);

  return (
    <div className="flex h-full flex-col">
      <div className="grid grid-cols-7 border-b">
        {WEEKDAYS.map((d) => (
          <div
            key={d}
            className="px-2 py-1.5 text-center text-xs font-medium uppercase tracking-wide text-muted-foreground"
          >
            {d}
          </div>
        ))}
      </div>
      <div className="grid min-h-0 flex-1 grid-rows-6">
        {weeks.map((wk, i) => (
          <WeekRow key={i} dayStarts={wk} {...rest} />
        ))}
      </div>
    </div>
  );
}

function WeekRow({
  dayStarts,
  occurrences,
  today,
  focusedMs,
  colorOf,
  selectedKey,
  onSelect,
  onPickDay,
  onChangeColor,
  onDeleteEvent,
  canEdit,
}: CommonProps & { dayStarts: number[] }) {
  const layout = useMemo(
    () => packMonthWeek(occurrences, dayStarts, MAX_LANES),
    [occurrences, dayStarts],
  );

  return (
    <div className="relative min-h-0 overflow-hidden border-b">
      {/* Background day cells */}
      <div className="grid h-full grid-cols-7">
        {dayStarts.map((d) => {
          const inMonth = isSameMonth(d, focusedMs);
          const isToday = d === today;
          return (
            <div
              key={d}
              className={cn("min-w-0 border-l", !inMonth && "bg-muted/40")}
            >
              <button
                type="button"
                onClick={() => onPickDay(d)}
                className={cn(
                  "m-1 flex size-6 items-center justify-center rounded-full text-xs tabular-nums hover:bg-accent",
                  isToday &&
                    "bg-primary font-semibold text-primary-foreground hover:bg-primary",
                  !inMonth && !isToday && "text-muted-foreground",
                )}
              >
                {format(d, "d")}
              </button>
            </div>
          );
        })}
      </div>

      {/* Overlay: lane-packed bars + chips, then per-day overflow */}
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0"
        style={{ top: DAY_HEADER_PX }}
      >
        {Array.from({ length: MAX_LANES }).map((_, lane) => (
          <div key={lane} className="grid grid-cols-7" style={{ height: LANE_PX }}>
            {layout.items
              .filter((it) => it.lane === lane)
              .map((it) => (
                <ItemContextMenu
                  key={it.occ.key}
                  mobileSheet={false}
                  title={it.occ.title}
                  color={canEdit(it.occ) ? it.occ.color : undefined}
                  onColorChange={canEdit(it.occ) ? (c) => onChangeColor(it.occ, c) : undefined}
                  actions={
                    canEdit(it.occ)
                      ? [
                          { label: "Edit", icon: Pencil, onSelect: () => onSelect(it.occ) },
                          {
                            label: "Delete",
                            icon: Trash2,
                            destructive: true,
                            onSelect: () => onDeleteEvent(it.occ),
                          },
                        ]
                      : [{ label: "Open", icon: Eye, onSelect: () => onSelect(it.occ) }]
                  }
                >
                  <MonthItemEl
                    item={it}
                    color={colorOf(it.occ)}
                    selected={selectedKey === it.occ.key}
                    onSelect={onSelect}
                  />
                </ItemContextMenu>
              ))}
          </div>
        ))}
        <div className="grid grid-cols-7">
          {layout.overflow.map((n, col) => (
            <div key={col} className="min-w-0 px-1">
              {n > 0 && (
                <MoreButton
                  day={dayStarts[col]}
                  count={n}
                  occurrences={occurrences}
                  colorOf={colorOf}
                  onSelect={onSelect}
                />
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const MonthItemEl = forwardRef<
  HTMLButtonElement,
  {
    item: MonthItem;
    color: string;
    selected: boolean;
    onSelect: (o: Occurrence) => void;
  } & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "onSelect">
>(function MonthItemEl({ item, color, selected, onSelect, ...rest }, ref) {
  const style: React.CSSProperties = {
    gridColumn: `${item.colStart + 1} / ${item.colEnd + 2}`,
  };

  if (item.isBar) {
    return (
      <button
        ref={ref}
        type="button"
        style={{ ...style, backgroundColor: color }}
        onClick={() => onSelect(item.occ)}
        className={cn(
          "pointer-events-auto mx-1 truncate rounded px-1.5 text-left text-xs leading-5 text-white",
          selected && "ring-2 ring-foreground",
          item.occ.inactive && "opacity-55 grayscale",
        )}
        {...rest}
      >
        {item.occ.title}
      </button>
    );
  }

  return (
    <button
      ref={ref}
      type="button"
      style={style}
      onClick={() => onSelect(item.occ)}
      className={cn(
        "pointer-events-auto mx-1 flex items-center gap-1 truncate rounded px-1 text-left text-xs leading-5 hover:bg-accent",
        selected && "ring-2 ring-foreground",
        item.occ.inactive && "opacity-55 grayscale",
      )}
      {...rest}
    >
      <span
        className="size-1.5 shrink-0 rounded-full"
        style={{ backgroundColor: color }}
      />
      <span className="truncate text-foreground">{item.occ.title}</span>
    </button>
  );
});

function MoreButton({
  day,
  count,
  occurrences,
  colorOf,
  onSelect,
}: {
  day: number;
  count: number;
  occurrences: Occurrence[];
  colorOf: (o: Occurrence) => string;
  onSelect: (o: Occurrence) => void;
}) {
  const items = occurrencesOnDay(occurrences, day);
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="pointer-events-auto w-full truncate rounded px-1 text-left text-xs font-medium text-muted-foreground hover:bg-accent"
        >
          +{count} more
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-60 p-2">
        <div className="mb-1 px-1 text-xs font-medium text-muted-foreground">
          {format(day, "EEEE, MMM d")}
        </div>
        <div className="flex flex-col gap-0.5">
          {items.map((o) => (
            <button
              key={o.key}
              type="button"
              onClick={() => onSelect(o)}
              className={cn(
                "flex items-center gap-1.5 truncate rounded px-1.5 py-1 text-left text-sm hover:bg-accent",
                o.inactive && "opacity-55 grayscale",
              )}
            >
              <span
                className="size-2 shrink-0 rounded-full"
                style={{ backgroundColor: colorOf(o) }}
              />
              <span className="truncate">{o.title}</span>
              {!o.allDay && (
                <span className="ml-auto shrink-0 text-xs text-muted-foreground tabular-nums">
                  {format(o.start, "h:mm a")}
                </span>
              )}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
