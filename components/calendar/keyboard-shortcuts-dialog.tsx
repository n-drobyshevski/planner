"use client";

import { useTranslations } from "next-intl";
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
 * calendar-scoped. Labels are keyed into the "calendar" catalog
 * (shortcuts.groups / shortcuts.items); the key glyphs stay literal. Kept in
 * sync with the handlers in calendar-shell / time-grid by being edited
 * alongside them.
 */
const GROUPS: { titleKey: string; items: { labelKey: string; keys: string[] }[] }[] = [
  {
    titleKey: "general",
    items: [
      { labelKey: "showHelp", keys: ["?"] },
      { labelKey: "undo", keys: ["Ctrl", "Z"] },
      { labelKey: "blurTitles", keys: ["Shift", "M"] },
    ],
  },
  {
    titleKey: "viewPanels",
    items: [
      { labelKey: "toggleFilters", keys: ["Ctrl", "Alt", "←"] },
      { labelKey: "toggleTasks", keys: ["Ctrl", "Alt", "→"] },
      { labelKey: "zoom", keys: ["Ctrl", "scroll"] },
      { labelKey: "resetZoom", keys: ["Ctrl", "0"] },
      { labelKey: "prevNext", keys: ["Shift", "scroll"] },
    ],
  },
  {
    titleKey: "selectEdit",
    items: [
      { labelKey: "openEvent", keys: ["click"] },
      { labelKey: "moveBetween", keys: ["↑", "↓"] },
      { labelKey: "moveDay", keys: ["←", "→"] },
      { labelKey: "openFocused", keys: ["Enter"] },
      { labelKey: "toggleSelection", keys: ["Shift", "click"] },
      { labelKey: "deleteSelected", keys: ["Del"] },
      { labelKey: "deleteSeries", keys: ["Alt", "Del"] },
      { labelKey: "clearSelection", keys: ["Esc"] },
    ],
  },
  {
    titleKey: "moveCreate",
    items: [
      { labelKey: "move", keys: ["drag"] },
      { labelKey: "resize", keys: ["drag"] },
      { labelKey: "create", keys: ["drag"] },
      { labelKey: "duplicate", keys: ["Ctrl", "drag"] },
      { labelKey: "wholeSeries", keys: ["Alt", "drag"] },
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
  const t = useTranslations("calendar");
  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange}>
      <ResponsiveDialogContent className="sm:max-w-md">
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle>{t("shortcuts.title")}</ResponsiveDialogTitle>
        </ResponsiveDialogHeader>
        <ResponsiveDialogBody className="flex flex-col gap-5 pb-2">
          {GROUPS.map((group) => (
            <section key={group.titleKey} className="flex flex-col gap-1.5">
              <h3 className="text-xs font-medium text-muted-foreground">
                {t(`shortcuts.groups.${group.titleKey}`)}
              </h3>
              <dl className="flex flex-col">
                {group.items.map((item) => (
                  <div
                    key={item.labelKey}
                    className="flex items-center justify-between gap-4 border-b border-border/60 py-1.5 last:border-0"
                  >
                    <dt className="text-sm">{t(`shortcuts.items.${item.labelKey}`)}</dt>
                    <dd>
                      <Combo keys={item.keys} />
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
          <p className="text-xs text-muted-foreground">
            {t("shortcuts.macHint")}
          </p>
        </ResponsiveDialogBody>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}
