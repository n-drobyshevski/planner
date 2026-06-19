"use client";

import {
  CheckCircle2,
  Circle,
  CopyPlus,
  Eye,
  Lock,
  MapPin,
  MoreHorizontal,
  Palette,
  Pencil,
  Repeat,
  SlidersHorizontal,
  Trash2,
  Users,
} from "lucide-react";
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
  ResponsiveDialogDescription,
  ResponsiveDialogBody,
  ResponsiveDialogFooter,
} from "@/components/ui/responsive-dialog";
import { useTranslations, useLocale } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
  DropdownMenuItem,
  DropdownMenuCheckboxItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
} from "@/components/ui/dropdown-menu";
import { ColorSwatchPicker } from "@/components/shared/color-swatch-picker";
import {
  formatOccurrenceWhen,
  formatOccurrenceWhenParts,
  formatDayMonthToken,
} from "@/lib/datetime/format";
import {
  useViewerTimeZone,
  useSecondaryTimeZone,
} from "@/lib/datetime/timezone-context";
import { parseRRule, summarizeRecurrence } from "@/lib/recurrence/rrule-build";
import { toPaletteColor } from "@/lib/theme/appearance";
import type { EventRow, EventStatus, Occurrence, TaskRow } from "@/lib/types";

type Visibility = "private" | "visible" | "shared";

interface EventDetailsProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  occurrence: Occurrence;
  /** master row, for the recurrence rule */
  event: EventRow;
  /** resolved display color (per-item / category / owner) */
  color: string;
  /** the owner's member identity color (hex), for the "whose" dot */
  ownerColor?: string;
  categoryName?: string | null;
  /** the owner's category/per-item color, for the category swatch */
  categoryColor?: string | null;
  ownerName: string;
  /** the viewer owns this item (can edit); otherwise read-only overlay */
  isOwn: boolean;
  /** the item is joint via its (Shared) context — the visibility control is hidden */
  sharedContext: boolean;
  task?: TaskRow | null;
  taskDone?: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onDuplicate?: () => void;
  onChangeColor: (color: string | null) => void;
  /** set this single event's private/visible/shared state */
  onChangeVisibility?: (v: Visibility) => void;
  onChangeStatus?: (status: EventStatus) => void;
  onToggleInactive?: () => void;
  /** copy another member's event onto my calendar (read-only items only) */
  onCopyToMine?: () => void;
  onToggleTaskDone?: () => void;
  /** open the task this block belongs to (own, editable tasks only) */
  onOpenTask?: () => void;
}

/**
 * Read-only summary card for a clicked occurrence (dialog on desktop, bottom
 * sheet on mobile). The header is the headline (title + state badges); the body
 * leads with the *when* as the focal point, then a single quiet meta line
 * (whose · visibility · context), location, the linked task (in an inset), and
 * notes. Your own items get Edit / Delete plus a "More" menu (duplicate, color,
 * visibility, status, inactive); another member's overlaid item is view-only.
 * Edit/Delete defer to the shell's existing flows (the recurrence
 * this/future/all prompt, context-delete, etc.); the inline edits are
 * series-level master-row writes, matching the calendar's right-click actions.
 */
export function EventDetails({
  open,
  onOpenChange,
  occurrence,
  event,
  color,
  ownerColor,
  categoryName,
  categoryColor,
  ownerName,
  isOwn,
  sharedContext,
  task,
  taskDone,
  onEdit,
  onDelete,
  onDuplicate,
  onChangeColor,
  onChangeVisibility,
  onChangeStatus,
  onToggleInactive,
  onCopyToMine,
  onToggleTaskDone,
  onOpenTask,
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

  const when = formatOccurrenceWhenParts(
    occurrence.start,
    occurrence.end,
    occurrence.allDay,
    timeZone,
    locale,
  );
  const allDay = occurrence.allDay;
  // The "when" focal point: a small date context line + a large focal line.
  // timed same-day → big time; all-day → big date; cross-midnight → medium range.
  const dateLine = !allDay && when.secondary ? when.primary : null;
  const focalLine = allDay ? when.primary : when.secondary ?? when.primary;
  const focalClass = allDay
    ? "text-lg font-semibold leading-tight text-balance"
    : when.secondary
      ? "text-xl font-semibold tabular-nums leading-tight"
      : "text-base font-semibold tabular-nums leading-tight";
  const allDayTag = allDay ? when.secondary : null; // "All day"
  const secondZone =
    showSecondary &&
    `${formatOccurrenceWhen(
      occurrence.start,
      occurrence.end,
      occurrence.allDay,
      secondaryTimeZone!,
      locale,
    )} (${secondaryLabel})`;

  const visibility: Visibility = occurrence.isPrivate
    ? "private"
    : occurrence.isShared
      ? "shared"
      : "visible";
  const VisIcon = visibility === "private" ? Lock : visibility === "shared" ? Users : Eye;
  const visLabel =
    visibility === "private"
      ? t("dialog.visibilityPrivate")
      : visibility === "shared"
        ? t("dialog.visibilityShared")
        : t("dialog.visibilityVisible");

  const ownerLabel = isOwn ? t("details.you") : ownerName;

  const hasBadges =
    isContext ||
    occurrence.status !== "confirmed" ||
    occurrence.isException ||
    occurrence.inactive;

  // Comfortable touch targets on phones (44px), compact on desktop.
  const menuItem = "min-h-11 sm:min-h-7";

  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange}>
      <ResponsiveDialogContent className="sm:max-w-sm">
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle className="flex items-start gap-2 text-lg font-semibold">
            <span
              className="mt-1.5 size-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: toPaletteColor(color) }}
              aria-hidden
            />
            <span className="min-w-0 text-balance">
              {occurrence.title || t("details.untitled")}
            </span>
          </ResponsiveDialogTitle>

          {/* Screen-reader description (the card shows the same "when" visually). */}
          <ResponsiveDialogDescription className="sr-only">
            {formatOccurrenceWhen(
              occurrence.start,
              occurrence.end,
              occurrence.allDay,
              timeZone,
              locale,
            )}
          </ResponsiveDialogDescription>

          {hasBadges && (
            <div className="mt-0.5 flex flex-wrap gap-1.5">
              {isContext && <Badge variant="outline">{t("details.context")}</Badge>}
              {occurrence.status !== "confirmed" && (
                <Badge variant="outline" className="text-muted-foreground">
                  {t(`dialog.status${occurrence.status === "planned" ? "Planned" : "Cancelled"}`)}
                </Badge>
              )}
              {occurrence.isException && (
                <Badge variant="outline" className="text-muted-foreground">
                  {t("details.edited")}
                </Badge>
              )}
              {occurrence.inactive && (
                <Badge variant="outline" className="text-muted-foreground">
                  {t("details.inactive")}
                </Badge>
              )}
            </div>
          )}
        </ResponsiveDialogHeader>

        <ResponsiveDialogBody>
          <div className="flex flex-col gap-3.5 text-sm">
            {/* When — the focal point. */}
            <div className="flex flex-col gap-0.5">
              {dateLine && <span className="text-muted-foreground">{dateLine}</span>}
              <span className={focalClass}>{focalLine}</span>
              {allDayTag && <span className="text-muted-foreground">{allDayTag}</span>}
              {recText && (
                <span className="mt-0.5 flex items-center gap-1.5 text-muted-foreground">
                  <Repeat className="size-3.5 shrink-0" aria-hidden />
                  {recText}
                </span>
              )}
              {secondZone && <span className="text-muted-foreground">{secondZone}</span>}
            </div>

            {/* One quiet meta line: who · visibility · context. */}
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="inline-flex items-center gap-1.5">
                <span
                  className="size-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: toPaletteColor(ownerColor ?? color) }}
                  aria-hidden
                />
                {ownerLabel}
              </span>
              <span className="text-muted-foreground" aria-hidden>
                ·
              </span>
              <span className="inline-flex items-center gap-1.5">
                <VisIcon className="size-3.5" aria-hidden />
                {visLabel}
              </span>
              {categoryName && (
                <>
                  <span className="text-muted-foreground" aria-hidden>
                    ·
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    {categoryColor && (
                      <span
                        className="size-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: toPaletteColor(categoryColor) }}
                        aria-hidden
                      />
                    )}
                    {categoryName}
                  </span>
                </>
              )}
            </div>

            {occurrence.location && (
              <div className="flex items-center gap-2">
                <MapPin className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                <span className="min-w-0">{occurrence.location}</span>
              </div>
            )}

            {task && (
              <div className="flex items-start gap-2.5 rounded-lg bg-muted/40 p-2.5">
                {taskDone ? (
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                ) : (
                  <Circle className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                )}
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  {onOpenTask ? (
                    <button
                      type="button"
                      onClick={onOpenTask}
                      className="self-start rounded-sm font-medium underline-offset-2 hover:underline focus-visible:underline focus-visible:outline-none"
                    >
                      {task.title}
                    </button>
                  ) : (
                    <span className="font-medium">{task.title}</span>
                  )}
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-muted-foreground">
                    <span>{t(`taskStatus.${taskDone ? "done" : "open"}`)}</span>
                    {task.dueDate != null && (
                      <span className="tabular-nums">
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
                </div>
              </div>
            )}

            {occurrence.description && (
              <p className="whitespace-pre-wrap">{occurrence.description}</p>
            )}
          </div>
        </ResponsiveDialogBody>

        <ResponsiveDialogFooter className="sm:justify-between">
          {isOwn ? (
            <>
              <Button
                variant="ghost"
                onClick={onDelete}
                className="text-destructive max-sm:h-11"
              >
                <Trash2 data-icon="inline-start" />
                {tc("delete")}
              </Button>
              <div className="flex gap-2 max-sm:w-full">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="outline"
                      size="icon"
                      aria-label={t("details.more")}
                      className="max-sm:size-11"
                    >
                      <MoreHorizontal />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="min-w-48">
                    {onDuplicate && (
                      <DropdownMenuItem className={menuItem} onSelect={onDuplicate}>
                        <CopyPlus />
                        {t("details.duplicate")}
                      </DropdownMenuItem>
                    )}

                    <DropdownMenuSub>
                      <DropdownMenuSubTrigger className={menuItem}>
                        <Palette />
                        {t("details.changeColor")}
                      </DropdownMenuSubTrigger>
                      <DropdownMenuSubContent className="p-2">
                        <ColorSwatchPicker
                          value={occurrence.color}
                          onSelect={onChangeColor}
                          className="max-w-44"
                        />
                      </DropdownMenuSubContent>
                    </DropdownMenuSub>

                    {!isContext && !sharedContext && onChangeVisibility && (
                      <DropdownMenuSub>
                        <DropdownMenuSubTrigger className={menuItem}>
                          <VisIcon />
                          {t("details.visibility")}
                        </DropdownMenuSubTrigger>
                        <DropdownMenuSubContent>
                          <DropdownMenuRadioGroup
                            value={visibility}
                            onValueChange={(v) => onChangeVisibility(v as Visibility)}
                          >
                            <DropdownMenuRadioItem className={menuItem} value="private">
                              {t("dialog.visibilityPrivate")}
                            </DropdownMenuRadioItem>
                            <DropdownMenuRadioItem className={menuItem} value="visible">
                              {t("dialog.visibilityVisible")}
                            </DropdownMenuRadioItem>
                            <DropdownMenuRadioItem className={menuItem} value="shared">
                              {t("dialog.visibilityShared")}
                            </DropdownMenuRadioItem>
                          </DropdownMenuRadioGroup>
                        </DropdownMenuSubContent>
                      </DropdownMenuSub>
                    )}

                    {onChangeStatus && (
                      <DropdownMenuSub>
                        <DropdownMenuSubTrigger className={menuItem}>
                          <Circle />
                          {t("dialog.status")}
                        </DropdownMenuSubTrigger>
                        <DropdownMenuSubContent>
                          <DropdownMenuRadioGroup
                            value={occurrence.status}
                            onValueChange={(s) => onChangeStatus(s as EventStatus)}
                          >
                            <DropdownMenuRadioItem className={menuItem} value="confirmed">
                              {t("dialog.statusConfirmed")}
                            </DropdownMenuRadioItem>
                            <DropdownMenuRadioItem className={menuItem} value="planned">
                              {t("dialog.statusPlanned")}
                            </DropdownMenuRadioItem>
                            <DropdownMenuRadioItem className={menuItem} value="cancelled">
                              {t("dialog.statusCancelled")}
                            </DropdownMenuRadioItem>
                          </DropdownMenuRadioGroup>
                        </DropdownMenuSubContent>
                      </DropdownMenuSub>
                    )}

                    {onToggleInactive && (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuCheckboxItem
                          className={menuItem}
                          checked={occurrence.inactive}
                          onCheckedChange={() => onToggleInactive()}
                        >
                          <SlidersHorizontal />
                          {t("dialog.inactive")}
                        </DropdownMenuCheckboxItem>
                      </>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
                <Button onClick={onEdit} className="max-sm:h-11 max-sm:flex-1">
                  <Pencil data-icon="inline-start" />
                  {tc("edit")}
                </Button>
              </div>
            </>
          ) : (
            <div className="flex gap-2 max-sm:w-full sm:ml-auto">
              {occurrence.kind === "event" && onCopyToMine && (
                <Button
                  variant="outline"
                  onClick={onCopyToMine}
                  className="max-sm:h-11 max-sm:flex-1"
                >
                  <CopyPlus data-icon="inline-start" />
                  {t("details.copyToMyCalendar")}
                </Button>
              )}
              <Button
                variant="outline"
                onClick={() => onOpenChange(false)}
                className="max-sm:h-11 max-sm:flex-1"
              >
                {tc("close")}
              </Button>
            </div>
          )}
        </ResponsiveDialogFooter>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}
