"use client";

import { useTranslations } from "next-intl";
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
  const t = useTranslations("calendar");
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[80dvh]">
        <SheetHeader>
          <SheetTitle>{t("toolbar.filters")}</SheetTitle>
          <SheetDescription className="sr-only">
            {t("sidebar.filtersDescription")}
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
