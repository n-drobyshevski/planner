"use client";

import * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/** A single keystroke / gesture token, styled like a physical key. */
function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded border border-border bg-muted px-1.5 font-mono text-[11px] font-medium text-muted-foreground">
      {children}
    </kbd>
  );
}

interface Row {
  label: string;
  keys: React.ReactNode;
}

/**
 * The `?`-triggered reference for the calendar's keyboard + pointer power moves
 * (drag-create, Ctrl-duplicate, Alt-series, multi-select, zoom, paging). These
 * are otherwise invisible; this surfaces them without cluttering the grid. The
 * mod key renders ⌘ on Mac and Ctrl elsewhere, matching the `ctrlKey||metaKey`
 * the handlers accept.
 */
export function ShortcutsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const mod = React.useMemo(() => {
    if (typeof navigator === "undefined") return "Ctrl";
    return /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)
      ? "⌘"
      : "Ctrl";
  }, []);

  const groups: { title: string; rows: Row[] }[] = [
    {
      title: "Create & edit",
      rows: [
        { label: "New event", keys: <>Drag an empty area</> },
        { label: "Move", keys: <>Drag a block</> },
        { label: "Resize", keys: <>Drag a block&apos;s top / bottom edge</> },
        {
          label: "Duplicate",
          keys: (
            <>
              <Kbd>{mod}</Kbd> + drag
            </>
          ),
        },
        {
          label: "Whole recurring series",
          keys: (
            <>
              <Kbd>Alt</Kbd> + drag or delete
            </>
          ),
        },
        { label: "Open the focused event", keys: <Kbd>Enter</Kbd> },
        { label: "Delete the selected / focused event", keys: <Kbd>Delete</Kbd> },
        {
          label: "Undo",
          keys: (
            <>
              <Kbd>{mod}</Kbd> <Kbd>Z</Kbd>
            </>
          ),
        },
      ],
    },
    {
      title: "Select",
      rows: [
        {
          label: "Add events to a selection",
          keys: (
            <>
              <Kbd>Shift</Kbd> + click
            </>
          ),
        },
        { label: "Move focus between events", keys: <Kbd>Tab</Kbd> },
        { label: "Clear the selection", keys: <Kbd>Esc</Kbd> },
      ],
    },
    {
      title: "Navigate & view",
      rows: [
        {
          label: "Previous / next period",
          keys: (
            <>
              <Kbd>Shift</Kbd> + scroll, or swipe
            </>
          ),
        },
        {
          label: "Zoom the timeline",
          keys: (
            <>
              <Kbd>{mod}</Kbd> + scroll, or pinch
            </>
          ),
        },
        {
          label: "Reset zoom",
          keys: (
            <>
              <Kbd>{mod}</Kbd> <Kbd>0</Kbd>
            </>
          ),
        },
        { label: "Show this list", keys: <Kbd>?</Kbd> },
      ],
    },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Keyboard &amp; gestures</DialogTitle>
          <DialogDescription>Faster ways to work the calendar.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-5">
          {groups.map((g) => (
            <section key={g.title} className="flex flex-col gap-2">
              <h3 className="text-xs font-medium text-muted-foreground">{g.title}</h3>
              <dl className="flex flex-col gap-2">
                {g.rows.map((r) => (
                  <div
                    key={r.label}
                    className="flex items-center justify-between gap-6 text-sm"
                  >
                    <dt className="min-w-0 text-foreground">{r.label}</dt>
                    <dd className="flex shrink-0 items-center gap-1 whitespace-nowrap text-muted-foreground">
                      {r.keys}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
