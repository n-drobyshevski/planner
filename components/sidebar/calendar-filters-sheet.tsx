"use client";

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { CalendarFiltersContent } from "@/components/sidebar/calendar-sidebar";
import type { Member, Category } from "@/lib/types";

/**
 * Phone presentation of the calendar layer + category filters: a bottom sheet
 * reusing the exact same controls as the desktop sidebar.
 */
export function CalendarFiltersSheet({
  open,
  onOpenChange,
  workspaceId,
  currentMemberId,
  members,
  categories,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceId: string;
  currentMemberId: string;
  members: Member[];
  categories: Category[];
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[80dvh]">
        <SheetHeader>
          <SheetTitle>Filters</SheetTitle>
          <SheetDescription className="sr-only">
            Show or hide calendars and contexts.
          </SheetDescription>
        </SheetHeader>
        <div className="flex flex-col gap-5 overflow-y-auto px-4 pb-safe">
          <CalendarFiltersContent
            workspaceId={workspaceId}
            currentMemberId={currentMemberId}
            members={members}
            categories={categories}
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}
