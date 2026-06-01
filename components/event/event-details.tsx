"use client";

import { format } from "date-fns";
import {
  AlignLeft,
  CalendarDays,
  CheckCircle2,
  Circle,
  Clock,
  FolderClosed,
  Lock,
  MapPin,
  Palette,
  Pencil,
  Repeat,
  Tag,
  Trash2,
} from "lucide-react";
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
  ResponsiveDialogBody,
  ResponsiveDialogFooter,
} from "@/components/ui/responsive-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { ColorSwatchPicker } from "@/components/shared/color-swatch-picker";
import { formatOccurrenceWhen } from "@/lib/datetime/format";
import { parseRRule, summarizeRecurrence } from "@/lib/recurrence/rrule-build";
import type { EventRow, Occurrence, TaskRow } from "@/lib/types";

const TASK_STATUS_LABEL: Record<TaskRow["status"], string> = {
  todo: "To do",
  in_progress: "In progress",
  done: "Done",
};

interface EventDetailsProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  occurrence: Occurrence;
  /** master row, for the recurrence rule */
  event: EventRow;
  /** resolved display color (per-item / category / owner) */
  color: string;
  categoryName?: string | null;
  contextName?: string | null;
  ownerName: string;
  /** the viewer owns this item (can edit); otherwise read-only overlay */
  isOwn: boolean;
  task?: TaskRow | null;
  taskDone?: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onChangeColor: (color: string | null) => void;
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
  contextName,
  ownerName,
  isOwn,
  task,
  taskDone,
  onEdit,
  onDelete,
  onChangeColor,
  onToggleTaskDone,
}: EventDetailsProps) {
  const isContext = occurrence.kind === "context";
  const rec = parseRRule(event.rrule);
  const recText = rec ? summarizeRecurrence(rec) : null;

  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange}>
      <ResponsiveDialogContent>
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle className="flex items-center gap-2">
            <span
              className="size-3 shrink-0 rounded-[4px]"
              style={{ backgroundColor: color }}
              aria-hidden
            />
            <span className="min-w-0 truncate">{occurrence.title || "Untitled"}</span>
          </ResponsiveDialogTitle>
          {(occurrence.isPrivate || isContext) && (
            <div className="mt-1 flex flex-wrap gap-1.5">
              {isContext && <Badge variant="outline">Context</Badge>}
              {occurrence.isPrivate && (
                <Badge variant="outline" className="gap-1 text-muted-foreground">
                  <Lock /> Private
                </Badge>
              )}
            </div>
          )}
        </ResponsiveDialogHeader>

        <ResponsiveDialogBody>
          <div className="flex flex-col gap-3 text-sm">
            <Row icon={Clock}>
              <div>{formatOccurrenceWhen(occurrence.start, occurrence.end, occurrence.allDay)}</div>
              {recText && <div className="text-muted-foreground">{recText}</div>}
            </Row>

            {occurrence.location && (
              <Row icon={MapPin}>{occurrence.location}</Row>
            )}

            {categoryName && <Row icon={Tag}>{categoryName}</Row>}

            {contextName && <Row icon={FolderClosed}>{contextName}</Row>}

            {!isOwn && (
              <Row icon={CalendarDays}>
                <span className="text-muted-foreground">{ownerName}&apos;s calendar</span>
              </Row>
            )}

            {task && (
              <Row icon={taskDone ? CheckCircle2 : Circle}>
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span>Task · {TASK_STATUS_LABEL[task.status]}</span>
                  {task.dueAt != null && (
                    <span className="text-muted-foreground tabular-nums">
                      Due {format(task.dueAt, "MMM d")}
                    </span>
                  )}
                  {isOwn && onToggleTaskDone && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7"
                      onClick={onToggleTaskDone}
                    >
                      {taskDone ? "Mark not done" : "Mark done"}
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
                Delete
              </Button>
              <div className="flex gap-2">
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="icon" aria-label="Change color">
                      <Palette />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent align="end" className="w-auto">
                    <ColorSwatchPicker value={occurrence.color} onSelect={onChangeColor} />
                  </PopoverContent>
                </Popover>
                <Button onClick={onEdit}>
                  <Pencil data-icon="inline-start" />
                  Edit
                </Button>
              </div>
            </>
          ) : (
            <Button variant="outline" onClick={() => onOpenChange(false)} className="ml-auto">
              Close
            </Button>
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
