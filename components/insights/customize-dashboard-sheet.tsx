"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, RotateCcw, SlidersHorizontal } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  ResponsiveDialog,
  ResponsiveDialogBody,
  ResponsiveDialogContent,
  ResponsiveDialogDescription,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
} from "@/components/ui/responsive-dialog";
import {
  DASHBOARD_CARDS,
  isCustomized,
  moveCard,
  type DashboardCardId,
  type DashboardLayout,
} from "@/lib/insights/dashboard";

const LABEL_BY_ID = new Map(DASHBOARD_CARDS.map((c) => [c.id, c.label]));

/**
 * Overview customization: show/hide cards and reorder them with up/down
 * buttons (the keyboard-accessible alternative to drag). Every change writes
 * through immediately via `onChange` — the prefs hook is optimistic, so the
 * dashboard reorders live behind the dialog.
 */
export function CustomizeDashboardSheet({
  layout,
  lockedIds,
  onChange,
}: {
  layout: DashboardLayout;
  /** ids that are always shown elsewhere (the answer-zone lead figures), so
   *  they're not offered as toggleable cards here */
  lockedIds?: DashboardCardId[];
  onChange: (next: { order: string[]; hidden: string[] }) => void;
}) {
  const t = useTranslations("insights");
  const [open, setOpen] = useState(false);
  const locked = new Set(lockedIds ?? []);
  const rows = layout.order.filter((id) => !locked.has(id));

  function write(order: readonly string[], hidden: ReadonlySet<string>) {
    onChange({ order: [...order], hidden: [...hidden] });
  }

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        className="min-h-11 px-1.5 text-xs sm:min-h-7"
        onClick={() => setOpen(true)}
      >
        <SlidersHorizontal data-icon="inline-start" />
        {t("customize.trigger")}
      </Button>
      <ResponsiveDialog open={open} onOpenChange={setOpen}>
        <ResponsiveDialogContent>
          <ResponsiveDialogHeader>
            <ResponsiveDialogTitle>{t("customize.title")}</ResponsiveDialogTitle>
            <ResponsiveDialogDescription>
              {t("customize.description")}
            </ResponsiveDialogDescription>
          </ResponsiveDialogHeader>
          <ResponsiveDialogBody className="space-y-3">
            {locked.size > 0 && (
              <p className="text-xs text-muted-foreground">
                {t("customize.lockedNote")}
              </p>
            )}
            <ul className="space-y-1" role="list">
              {rows.map((id, i) => {
                const visible = !layout.hidden.has(id);
                return (
                  <li key={id} className="flex items-center gap-2">
                    <Checkbox
                      id={`dash-card-${id}`}
                      checked={visible}
                      onCheckedChange={(checked) => {
                        const hidden = new Set(layout.hidden);
                        if (checked === true) hidden.delete(id);
                        else hidden.add(id);
                        write(layout.order, hidden);
                      }}
                    />
                    <label
                      htmlFor={`dash-card-${id}`}
                      className="min-w-0 flex-1 truncate text-sm"
                    >
                      {LABEL_BY_ID.get(id) ?? id}
                    </label>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-11 text-muted-foreground sm:size-8"
                      disabled={i === 0}
                      aria-label={t("customize.moveUp", { label: LABEL_BY_ID.get(id) ?? id })}
                      onClick={() =>
                        write(moveCard(layout.order, id, "up"), layout.hidden)
                      }
                    >
                      <ChevronUp />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-11 text-muted-foreground sm:size-8"
                      disabled={i === rows.length - 1}
                      aria-label={t("customize.moveDown", { label: LABEL_BY_ID.get(id) ?? id })}
                      onClick={() =>
                        write(moveCard(layout.order, id, "down"), layout.hidden)
                      }
                    >
                      <ChevronDown />
                    </Button>
                  </li>
                );
              })}
            </ul>
            {isCustomized(layout) && (
              <div className="border-t pt-3">
                <Button
                  variant="ghost"
                  size="sm"
                  className="min-h-11 px-1.5 text-xs sm:min-h-7"
                  onClick={() => onChange({ order: [], hidden: [] })}
                >
                  <RotateCcw data-icon="inline-start" />
                  {t("customize.reset")}
                </Button>
              </div>
            )}
          </ResponsiveDialogBody>
        </ResponsiveDialogContent>
      </ResponsiveDialog>
    </>
  );
}
