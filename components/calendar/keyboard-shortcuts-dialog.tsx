"use client";

import { Kbd, KbdGroup } from "@/components/ui/kbd";
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
  ResponsiveDialogBody,
} from "@/components/ui/responsive-dialog";

/**
 * The calendar's keyboard + drag reference (opened by `?` or the toolbar's
 * "?" button). These all live on the week/day/3-day grid, so the sheet is
 * calendar-scoped. Kept as plain data so it stays in sync with the handlers in
 * calendar-shell / time-grid by being edited alongside them.
 */
const GROUPS: { title: string; items: { label: string; keys: string[] }[] }[] = [
  {
    title: "General",
    items: [
      { label: "Show this help", keys: ["?"] },
      { label: "Undo the last change", keys: ["Ctrl", "Z"] },
      { label: "Blur / unblur all titles", keys: ["Shift", "M"] },
    ],
  },
  {
    title: "View & panels",
    items: [
      { label: "Toggle the filters sidebar", keys: ["Ctrl", "Alt", "←"] },
      { label: "Toggle the tasks panel", keys: ["Ctrl", "Alt", "→"] },
      { label: "Zoom the day grid", keys: ["Ctrl", "scroll"] },
      { label: "Reset zoom", keys: ["Ctrl", "0"] },
      { label: "Previous / next period", keys: ["Shift", "scroll"] },
    ],
  },
  {
    title: "Select & edit (week / day)",
    items: [
      { label: "Open an event", keys: ["click"] },
      { label: "Move between events", keys: ["↑", "↓"] },
      { label: "Move to the next / previous day", keys: ["←", "→"] },
      { label: "Open the focused event", keys: ["Enter"] },
      { label: "Add to / remove from selection", keys: ["Shift", "click"] },
      { label: "Delete selected", keys: ["Del"] },
      { label: "Delete the whole series", keys: ["Alt", "Del"] },
      { label: "Clear selection", keys: ["Esc"] },
    ],
  },
  {
    title: "Move & create (week / day)",
    items: [
      { label: "Move an event", keys: ["drag"] },
      { label: "Resize (drag the top or bottom edge)", keys: ["drag"] },
      { label: "Create an event in an empty slot", keys: ["drag"] },
      { label: "Duplicate to the drop spot", keys: ["Ctrl", "drag"] },
      { label: "Act on the whole recurring series", keys: ["Alt", "drag"] },
    ],
  },
];

function Combo({ keys }: { keys: string[] }) {
  return (
    <KbdGroup className="shrink-0">
      {keys.map((k, i) => (
        <Kbd key={i}>{k}</Kbd>
      ))}
    </KbdGroup>
  );
}

export function KeyboardShortcutsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange}>
      <ResponsiveDialogContent className="sm:max-w-md">
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle>Keyboard shortcuts</ResponsiveDialogTitle>
        </ResponsiveDialogHeader>
        <ResponsiveDialogBody className="flex flex-col gap-5 pb-2">
          {GROUPS.map((group) => (
            <section key={group.title} className="flex flex-col gap-1.5">
              <h3 className="text-xs font-medium text-muted-foreground">
                {group.title}
              </h3>
              <dl className="flex flex-col">
                {group.items.map((item) => (
                  <div
                    key={item.label}
                    className="flex items-center justify-between gap-4 border-b border-border/60 py-1.5 last:border-0"
                  >
                    <dt className="text-sm">{item.label}</dt>
                    <dd>
                      <Combo keys={item.keys} />
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
          <p className="text-xs text-muted-foreground">
            On macOS, use ⌘ in place of Ctrl.
          </p>
        </ResponsiveDialogBody>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}
