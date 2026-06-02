"use client";

import * as React from "react";
import { MoreVertical, type LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { Button } from "@/components/ui/button";
import {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubTrigger,
  ContextMenuSubContent,
} from "@/components/ui/context-menu";
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
  ResponsiveDialogBody,
} from "@/components/ui/responsive-dialog";
import { ColorSwatchPicker } from "./color-swatch-picker";

/**
 * Run a menu action on the next tick. Even with a non-modal menu (see the
 * `modal={false}` note on ContextMenu below), Radix returns focus to the
 * trigger as the menu tears down on `onSelect`; opening a dialog synchronously
 * on the same tick races that and can flicker shut. Deferring one tick lets the
 * menu finish closing first. (The mobile sheet doesn't have this problem; it
 * already defers via its own close.)
 */
function runAfterClose(fn?: () => void) {
  if (fn) setTimeout(fn, 0);
}

export interface ItemAction {
  label: string;
  /** Omitted for a pure submenu parent (its `submenu` items carry the handlers). */
  onSelect?: () => void;
  icon?: LucideIcon;
  destructive?: boolean;
  /** Nested actions; rendered as a submenu (desktop) / inline group (mobile). */
  submenu?: ItemAction[];
}

/** A child leaf (EventBlock, TaskCard, …) that can host the mobile ⋮ affordance. */
export interface MenuableProps {
  /** When set (mobile), the leaf renders an ItemMenuButton wired to this. */
  onMenu?: () => void;
}

/**
 * Right-click / long-press quick menu for an event or task, with a curated color
 * picker. Two presentations from one definition:
 *  - desktop: a Radix ContextMenu (right-click) wrapping the leaf via `asChild`;
 *  - mobile: the leaf shows an explicit ⋮ button (injected as `onMenu`) that
 *    opens a bottom-sheet with the same actions + swatches.
 *
 * The mobile branch is used instead of Radix's touch long-press because the
 * calendar grid and the task board already claim long-press for drag.
 *
 * `children` must be a single element that accepts `onMenu` (see MenuableProps)
 * and — for the desktop branch — forwards ref/props to its root (asChild).
 */
export function ItemContextMenu({
  title,
  actions,
  color,
  onColorChange,
  mobileSheet = true,
  children,
}: {
  /** shown as the sheet header on mobile */
  title?: string;
  actions: ItemAction[];
  /** current own color (hex) or null; omit (with onColorChange) to hide the picker */
  color?: string | null;
  /** when omitted, the Color submenu / sheet section is not rendered */
  onColorChange?: (color: string | null) => void;
  /** set false to skip the mobile sheet (desktop right-click only) */
  mobileSheet?: boolean;
  children: React.ReactElement;
}) {
  const isMobile = useIsMobile();
  const [sheetOpen, setSheetOpen] = React.useState(false);

  if (isMobile) {
    if (!mobileSheet) return children;
    return (
      <>
        {React.cloneElement(children as React.ReactElement<MenuableProps>, {
          onMenu: () => setSheetOpen(true),
        })}
        <ItemActionSheet
          open={sheetOpen}
          onOpenChange={setSheetOpen}
          title={title}
          actions={actions}
          color={color}
          onColorChange={onColorChange}
        />
      </>
    );
  }

  const nonDestructive = actions.filter((a) => !a.destructive);
  const destructive = actions.filter((a) => a.destructive);

  return (
    // Non-modal: a modal ContextMenu locks `pointer-events: none` on <body> and
    // keeps a focus guard while it tears down. When an item opens a dialog (Edit
    // → details, Delete → recurrence prompt) that lock/guard races the dialog
    // mount and leaves it frozen or dismisses it — the menu items look "dead".
    // Non-modal drops the body lock, so the follow-up dialog is interactive.
    <ContextMenu modal={false}>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent className="min-w-44">
        {nonDestructive.map((a) =>
          a.submenu ? (
            <ContextMenuSub key={a.label}>
              <ContextMenuSubTrigger>
                {a.icon && <a.icon />}
                {a.label}
              </ContextMenuSubTrigger>
              <ContextMenuSubContent className="min-w-40">
                {a.submenu.map((s) => (
                  <ContextMenuItem
                    key={s.label}
                    variant={s.destructive ? "destructive" : undefined}
                    onSelect={() => runAfterClose(s.onSelect)}
                  >
                    {s.icon && <s.icon />}
                    {s.label}
                  </ContextMenuItem>
                ))}
              </ContextMenuSubContent>
            </ContextMenuSub>
          ) : (
            <ContextMenuItem key={a.label} onSelect={() => runAfterClose(a.onSelect)}>
              {a.icon && <a.icon />}
              {a.label}
            </ContextMenuItem>
          ),
        )}
        {onColorChange && (
          <ContextMenuSub>
            <ContextMenuSubTrigger>Color</ContextMenuSubTrigger>
            <ContextMenuSubContent className="p-2">
              <ColorSwatchPicker
                value={color ?? null}
                onSelect={onColorChange}
                className="max-w-44"
              />
            </ContextMenuSubContent>
          </ContextMenuSub>
        )}
        {destructive.length > 0 && <ContextMenuSeparator />}
        {destructive.map((a) => (
          <ContextMenuItem
            key={a.label}
            variant="destructive"
            onSelect={() => runAfterClose(a.onSelect)}
          >
            {a.icon && <a.icon />}
            {a.label}
          </ContextMenuItem>
        ))}
      </ContextMenuContent>
    </ContextMenu>
  );
}

/** The mobile bottom-sheet form of the menu: actions + the swatch grid. */
export function ItemActionSheet({
  open,
  onOpenChange,
  title,
  actions,
  color,
  onColorChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  actions: ItemAction[];
  color?: string | null;
  onColorChange?: (color: string | null) => void;
}) {
  const close = () => onOpenChange(false);
  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange}>
      <ResponsiveDialogContent>
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle>{title ?? "Options"}</ResponsiveDialogTitle>
        </ResponsiveDialogHeader>
        <ResponsiveDialogBody className="flex flex-col gap-4 py-3 pb-6">
          {onColorChange && (
            <div className="flex flex-col gap-2">
              <span className="text-xs font-medium text-muted-foreground">Color</span>
              <ColorSwatchPicker
                value={color ?? null}
                onSelect={(c) => {
                  onColorChange(c);
                  close();
                }}
              />
            </div>
          )}
          <div className="flex flex-col gap-1">
            {actions.map((a) => {
              const Icon = a.icon;
              // A submenu parent becomes a small labelled group of buttons.
              if (a.submenu) {
                return (
                  <div key={a.label} className="flex flex-col gap-1">
                    <span className="px-3 pt-1 text-xs font-medium text-muted-foreground">
                      {a.label}
                    </span>
                    {a.submenu.map((s) => {
                      const SIcon = s.icon;
                      return (
                        <Button
                          key={s.label}
                          variant="ghost"
                          className={cn(
                            "h-11 justify-start pl-5",
                            s.destructive && "text-destructive hover:text-destructive",
                          )}
                          onClick={() => {
                            s.onSelect?.();
                            close();
                          }}
                        >
                          {SIcon && <SIcon data-icon="inline-start" />}
                          {s.label}
                        </Button>
                      );
                    })}
                  </div>
                );
              }
              return (
                <Button
                  key={a.label}
                  variant="ghost"
                  className={cn(
                    "h-11 justify-start",
                    a.destructive && "text-destructive hover:text-destructive",
                  )}
                  onClick={() => {
                    a.onSelect?.();
                    close();
                  }}
                >
                  {Icon && <Icon data-icon="inline-start" />}
                  {a.label}
                </Button>
              );
            })}
          </div>
        </ResponsiveDialogBody>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}

/**
 * The ⋮ affordance a leaf renders on mobile. Stops pointer/click propagation so
 * it never starts a grid/dnd drag or opens the item's editor.
 */
export const ItemMenuButton = React.forwardRef<
  HTMLButtonElement,
  { onMenu: () => void; className?: string; label?: string }
>(function ItemMenuButton({ onMenu, className, label = "More options" }, ref) {
  return (
    <button
      ref={ref}
      type="button"
      aria-label={label}
      onPointerDown={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      onTouchStart={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation();
        onMenu();
      }}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded text-current/80 hover:text-current",
        className,
      )}
    >
      <MoreVertical className="size-4" />
    </button>
  );
});
