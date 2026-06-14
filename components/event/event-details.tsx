"use client";

import {
  AlignLeft,
  CalendarDays,
  CheckCircle2,
  Circle,
  Clock,
  Lock,
  MapPin,
  Palette,
  CopyPlus,
  Pencil,
  Repeat,
  Tag,
  Trash2,
  User,
  Users,
} from "lucide-react";
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
  ResponsiveDialogBody,
  ResponsiveDialogFooter,
} from "@/components/ui/responsive-dialog";
import { useTranslations, useLocale } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { ColorSwatchPicker } from "@/components/shared/color-swatch-picker";
import { formatOccurrenceWhen, formatDayMonthToken } from "@/lib/datetime/format";
import {
  useViewerTimeZone,
  useSecondaryTimeZone,
} from "@/lib/datetime/timezone-context";
import { parseRRule, summarizeRecurrence } from "@/lib/recurrence/rrule-build";
import { toPaletteColor } from "@/lib/theme/appearance";
import type { EventRow, Occurrence, TaskRow } from "@/lib/types";

interface EventDetailsProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  occurrence: Occurrence;
  /** master row, for the recurrence rule */
  event: EventRow;
  /** resolved display color (per-item / category / owner) */
  color: string;
  categoryName?: string | null;
  ownerName: string;
  /** the viewer owns this item (can edit); otherwise read-only overlay */
  isOwn: boolean;
  /** the item is joint via its (Shared) context — per-event share toggle is hidden */
  sharedContext: boolean;
  task?: TaskRow | null;
  taskDone?: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onChangeColor: (color: string | null) => void;
  /** toggle this single event's joint (Shared) flag */
  onToggleEventShared: () => void;
  /** copy another member's event onto my calendar (read-only items only) */
  onCopyToMine?: () => void;
  onToggleTaskDone?: () => void;
}

/**
 * Read-only summary card for a clicked occurrence (dialog on desktop, bottom
 * sheet on mobile). Your own items get Edit / Delete / Change color; another
 * member's overlaid item is view-only. Edit/Delete defer to the shell's
 * existing flows (the recurrence this/future/all prompt, context-delete, etc.).
 */
export function EventDetails({
  open,
  onOpenChange,
  occurrence,
  event,
  color,
  categoryName,
  ownerName,
  isOwn,
  sharedContext,
  task,
  taskDone,
  onEdit,
  onDelete,
  onChangeColor,
  onToggleEventShared,
  onCopyToMine,
  onToggleTaskDone,
}: EventDetailsProps) {
  const t = useTranslations("events");
  const tc = useTranslations("common");
  const tr = useTranslations("recurrence");
  const locale = useLocale();
  const isContext = occurrence.kind === "context";
  const rec = parseRRule(event.rrule);
  const recText = rec ? summarizeRecurrence(rec, tr, locale) : null;
  const timeZone = useViewerTimeZone();
  const secondaryTimeZone = useSecondaryTimeZone();
  // All-day events are floating dates (same for everyone), so a secondary zone
  // only adds value for timed occurrences.
  const showSecondary = secondaryTimeZone != null && !occurrence.allDay;
  const secondaryLabel = secondaryTimeZone?.split("/").pop()?.replace(/_/g, " ");

  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange}>
      <ResponsiveDialogContent>
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle className="flex items-center gap-2">
            <span
              className="size-3 shrink-0 rounded-[4px]"
              style={{ backgroundColor: toPaletteColor(color) }}
              aria-hidden
            />
            <span className="min-w-0 truncate">{occurrence.title || t("details.untitled")}</span>
          </ResponsiveDialogTitle>
          {(occurrence.isPrivate ||
            occurrence.isShared ||
            isContext ||
            occurrence.status !== "confirmed") && (
            <div className="mt-1 flex flex-wrap gap-1.5">
              {isContext && <Badge variant="outline">{t("details.context")}</Badge>}
              {occurrence.status !== "confirmed" && (
                <Badge variant="outline" className="text-muted-foreground">
                  {t(`dialog.status${occurrence.status === "planned" ? "Planned" : "Cancelled"}`)}
                </Badge>
              )}
              {occurrence.isPrivate && (
                <Badge variant="outline" className="gap-1 text-muted-foreground">
                  <Lock /> {t("details.private")}
                </Badge>
              )}
              {occurrence.isShared && (
                <Badge variant="outline" className="gap-1 text-muted-foreground">
                  <Users /> {t("details.shared")}
                </Badge>
              )}
            </div>
          )}
        </ResponsiveDialogHeader>

        <ResponsiveDialogBody>
          <div className="flex flex-col gap-3 text-sm">
            <Row icon={Clock}>
              <div>
                {formatOccurrenceWhen(
                  occurrence.start,
                  occurrence.end,
                  occurrence.allDay,
                  timeZone,
                  locale,
                )}
              </div>
              {showSecondary && (
                <div className="text-muted-foreground">
                  {formatOccurrenceWhen(
                    occurrence.start,
                    occurrence.end,
                    occurrence.allDay,
                    secondaryTimeZone!,
                    locale,
                  )}{" "}
                  ({secondaryLabel})
                </div>
              )}
              {recText && <div className="text-muted-foreground">{recText}</div>}
            </Row>

            {occurrence.location && (
              <Row icon={MapPin}>{occurrence.location}</Row>
            )}

            {categoryName && <Row icon={Tag}>{categoryName}</Row>}

            {!isOwn && (
              <Row icon={CalendarDays}>
                <span className="text-muted-foreground">
                  {t("details.ownersCalendar", { name: ownerName })}
                </span>
              </Row>
            )}

            {task && (
              <Row icon={taskDone ? CheckCircle2 : Circle}>
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span>{t("details.taskStatusLine", { status: t(`taskStatus.${task.status}`) })}</span>
                  {task.dueDate != null && (
                    <span className="text-muted-foreground tabular-nums">
                      {t("details.due", { date: formatDayMonthToken(task.dueDate, locale) })}
                    </span>
                  )}
                  {isOwn && onToggleTaskDone && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7"
                      onClick={onToggleTaskDone}
                    >
                      {taskDone ? t("details.markNotDone") : t("details.markDone")}
                    </Button>
                  )}
                </div>
              </Row>
            )}

            {occurrence.description && (
              <Row icon={AlignLeft}>
                <p className="whitespace-pre-wrap">{occurrence.description}</p>
              </Row>
            )}
          </div>
        </ResponsiveDialogBody>

        <ResponsiveDialogFooter className="sm:justify-between">
          {isOwn ? (
            <>
              <Button
                variant="ghost"
                onClick={onDelete}
                className="text-destructive"
              >
                <Trash2 data-icon="inline-start" />
                {tc("delete")}
              </Button>
              <div className="flex gap-2">
                {!isContext && !sharedContext && (
                  <Button variant="outline" size="sm" onClick={onToggleEventShared}>
                    {occurrence.isShared ? (
                      <>
                        <User data-icon="inline-start" />
                        {t("details.makePersonal")}
                      </>
                    ) : (
                      <>
                        <Users data-icon="inline-start" />
                        {t("details.share")}
                      </>
                    )}
                  </Button>
                )}
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="icon" aria-label={t("details.changeColor")}>
                      <Palette />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent align="end" className="w-auto">
                    <ColorSwatchPicker value={occurrence.color} onSelect={onChangeColor} />
                  </PopoverContent>
                </Popover>
                <Button onClick={onEdit}>
                  <Pencil data-icon="inline-start" />
                  {tc("edit")}
                </Button>
              </div>
            </>
          ) : (
            <div className="ml-auto flex gap-2">
              {occurrence.kind === "event" && onCopyToMine && (
                <Button variant="outline" onClick={onCopyToMine}>
                  <CopyPlus data-icon="inline-start" />
                  {t("details.copyToMyCalendar")}
                </Button>
              )}
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                {tc("close")}
              </Button>
            </div>
          )}
        </ResponsiveDialogFooter>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}

function Row({
  icon: Icon,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3">
      <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
