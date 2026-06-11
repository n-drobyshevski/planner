"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, RotateCcw, SlidersHorizontal } from "lucide-react";

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
  onChange,
}: {
  layout: DashboardLayout;
  onChange: (next: { order: string[]; hidden: string[] }) => void;
}) {
  const [open, setOpen] = useState(false);

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
        Customize
      </Button>
      <ResponsiveDialog open={open} onOpenChange={setOpen}>
        <ResponsiveDialogContent>
          <ResponsiveDialogHeader>
            <ResponsiveDialogTitle>Customize overview</ResponsiveDialogTitle>
            <ResponsiveDialogDescription>
              Pick which cards show and in what order. This is your layout —
              your partner keeps theirs.
            </ResponsiveDialogDescription>
          </ResponsiveDialogHeader>
          <ResponsiveDialogBody className="space-y-3">
            <ul className="space-y-1" role="list">
              {layout.order.map((id, i) => {
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
                      aria-label={`Move ${LABEL_BY_ID.get(id) ?? id} up`}
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
                      disabled={i === layout.order.length - 1}
                      aria-label={`Move ${LABEL_BY_ID.get(id) ?? id} down`}
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
                  Reset to default
                </Button>
              </div>
            )}
          </ResponsiveDialogBody>
        </ResponsiveDialogContent>
      </ResponsiveDialog>
    </>
  );
}
