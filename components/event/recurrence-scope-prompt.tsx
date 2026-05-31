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
  mode: "edit" | "delete";
  onChoose: (scope: RecurrenceScope) => void;
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {mode === "delete" ? "Delete recurring event" : "Edit recurring event"}
          </AlertDialogTitle>
          <AlertDialogDescription>Apply to which events?</AlertDialogDescription>
        </AlertDialogHeader>
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
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
