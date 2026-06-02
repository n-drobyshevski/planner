"use client";

import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

export type RecurrenceScope = "this" | "future" | "all";

export function RecurrenceScopePrompt({
  open,
  onOpenChange,
  mode,
  onChoose,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "edit" | "delete" | "copy";
  onChoose: (scope: RecurrenceScope) => void;
}) {
  const title =
    mode === "delete"
      ? "Delete recurring event"
      : mode === "copy"
        ? "Copy recurring event"
        : "Edit recurring event";
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>
            {mode === "copy" ? "Copy which events?" : "Apply to which events?"}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {/* Copy offers just this-occurrence vs the whole series; "this and
            following" only makes sense for edit/delete. */}
        {mode === "copy" ? (
          <div className="flex flex-col gap-2">
            <Button variant="outline" onClick={() => onChoose("this")}>
              This event
            </Button>
            <Button onClick={() => onChoose("all")}>Whole series</Button>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <Button variant="outline" onClick={() => onChoose("this")}>
              This event
            </Button>
            <Button variant="outline" onClick={() => onChoose("future")}>
              This and following events
            </Button>
            <Button
              variant={mode === "delete" ? "destructive" : "default"}
              onClick={() => onChoose("all")}
            >
              All events
            </Button>
          </div>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
