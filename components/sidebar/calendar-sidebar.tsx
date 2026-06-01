"use client";

import * as React from "react";
import { Plus, SquarePen, Focus, Eye, Trash2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  ItemContextMenu,
  ItemMenuButton,
  type ItemAction,
} from "@/components/shared/item-context-menu";
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
  ResponsiveDialogDescription,
  ResponsiveDialogBody,
  ResponsiveDialogFooter,
} from "@/components/ui/responsive-dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { createClient } from "@/lib/supabase/client";
import { createCategory } from "@/lib/supabase/mutations";
import { useSidebarMutations } from "@/lib/hooks/use-sidebar-mutations";
import { qk } from "@/lib/supabase/query-keys";
import { useUiStore } from "@/stores/ui-store";
import { cn } from "@/lib/utils";
import type { Member, Category } from "@/lib/types";

const SHARED_COLOR = "#b45309";
const PALETTE = ["#c0492a", "#0f766e", "#b45309", "#15803d", "#0369a1", "#be185d", "#7c3aed"];

interface FiltersProps {
  workspaceId: string;
  /** the signed-in member; only this calendar row is renamable / recolorable */
  currentMemberId: string;
  members: Member[];
  categories: Category[];
}

/** Rename / delete target shape used by the shared dialogs below. */
type RenameTarget = { kind: "member" | "category"; id: string; name: string };

const ToggleRow = React.forwardRef<
  HTMLDivElement,
  {
    color: string;
    label: string;
    active: boolean;
    onToggle: () => void;
    /** when set (mobile), render the ⋮ affordance that opens the action sheet */
    onMenu?: () => void;
  } & React.HTMLAttributes<HTMLDivElement>
>(function ToggleRow({ color, label, active, onToggle, onMenu, className, ...rest }, ref) {
  return (
    <div
      ref={ref}
      className={cn(
        "flex items-center rounded-md hover:bg-sidebar-accent",
        className,
      )}
      {...rest}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-pressed={active}
        className="flex min-h-11 flex-1 items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-sm md:min-h-0"
      >
        <span
          className="size-3.5 shrink-0 rounded-[4px] border-2"
          style={{
            backgroundColor: active ? color : "transparent",
            borderColor: color,
          }}
        />
        <span className={cn("truncate", !active && "text-muted-foreground line-through")}>
          {label}
        </span>
      </button>
      {onMenu && <ItemMenuButton onMenu={onMenu} className="mr-1 size-9" />}
    </div>
  );
});

/**
 * Layer + category filter controls, shared by the desktop sidebar and the
 * mobile bottom sheet so the two presentations never drift apart.
 *
 * Each row carries a right-click (desktop) / long-press ⋮ (mobile) menu:
 *  - calendars: "show only this" / "show all"; the signed-in member's own row
 *    also gets rename + recolor (RLS restricts member edits to the self row);
 *  - categories: rename, recolor, show-only/show-all, and delete.
 */
export function CalendarFiltersContent({
  workspaceId,
  currentMemberId,
  members,
  categories,
}: FiltersProps) {
  const hiddenLayers = useUiStore((s) => s.hiddenLayers);
  const hiddenCategoryIds = useUiStore((s) => s.hiddenCategoryIds);
  const toggleLayer = useUiStore((s) => s.toggleLayer);
  const toggleCategory = useUiStore((s) => s.toggleCategory);
  const setHiddenLayers = useUiStore((s) => s.setHiddenLayers);
  const setHiddenCategoryIds = useUiStore((s) => s.setHiddenCategoryIds);
  const mutations = useSidebarMutations();

  const [renaming, setRenaming] = React.useState<RenameTarget | null>(null);
  const [deleting, setDeleting] = React.useState<{ id: string; name: string } | null>(null);

  const layerIds = React.useMemo(
    () => ["shared", ...members.map((m) => m.id)],
    [members],
  );

  const layerVisibility = (id: string): ItemAction[] => [
    {
      label: "Show only this",
      icon: Focus,
      onSelect: () => setHiddenLayers(new Set(layerIds.filter((l) => l !== id))),
    },
    { label: "Show all", icon: Eye, onSelect: () => setHiddenLayers(new Set()) },
  ];

  const categoryVisibility = (id: string): ItemAction[] => [
    {
      label: "Show only this",
      icon: Focus,
      onSelect: () =>
        setHiddenCategoryIds(
          new Set(categories.filter((c) => c.id !== id).map((c) => c.id)),
        ),
    },
    { label: "Show all", icon: Eye, onSelect: () => setHiddenCategoryIds(new Set()) },
  ];

  return (
    <>
      <section className="flex flex-col gap-0.5">
        <h3 className="px-2 pb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Calendars
        </h3>
        <ItemContextMenu title="Shared" actions={layerVisibility("shared")}>
          <ToggleRow
            color={SHARED_COLOR}
            label="Shared"
            active={!hiddenLayers.has("shared")}
            onToggle={() => toggleLayer("shared")}
          />
        </ItemContextMenu>
        {members.map((m) => {
          const own = m.id === currentMemberId;
          return (
            <ItemContextMenu
              key={m.id}
              title={m.name}
              color={own ? m.color : undefined}
              onColorChange={
                own ? (c) => c && void mutations.recolorMember(m.id, c) : undefined
              }
              actions={[
                ...(own
                  ? [
                      {
                        label: "Rename",
                        icon: SquarePen,
                        onSelect: () =>
                          setRenaming({ kind: "member", id: m.id, name: m.name }),
                      },
                    ]
                  : []),
                ...layerVisibility(m.id),
              ]}
            >
              <ToggleRow
                color={m.color}
                label={m.name}
                active={!hiddenLayers.has(m.id)}
                onToggle={() => toggleLayer(m.id)}
              />
            </ItemContextMenu>
          );
        })}
      </section>

      <section className="flex flex-col gap-0.5">
        <div className="flex items-center justify-between px-2 pb-1">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Categories
          </h3>
          <AddCategoryPopover workspaceId={workspaceId} />
        </div>
        {categories.length === 0 ? (
          <p className="px-2 text-xs text-muted-foreground">No categories yet</p>
        ) : (
          categories.map((c) => (
            <ItemContextMenu
              key={c.id}
              title={c.name}
              color={c.color}
              onColorChange={(color) => color && void mutations.recolorCategory(c.id, color)}
              actions={[
                {
                  label: "Rename",
                  icon: SquarePen,
                  onSelect: () => setRenaming({ kind: "category", id: c.id, name: c.name }),
                },
                ...categoryVisibility(c.id),
                {
                  label: "Delete",
                  icon: Trash2,
                  destructive: true,
                  onSelect: () => setDeleting({ id: c.id, name: c.name }),
                },
              ]}
            >
              <ToggleRow
                color={c.color}
                label={c.name}
                active={!hiddenCategoryIds.has(c.id)}
                onToggle={() => toggleCategory(c.id)}
              />
            </ItemContextMenu>
          ))
        )}
      </section>

      <RenameDialog
        target={renaming}
        onClose={() => setRenaming(null)}
        onSubmit={(t, name) =>
          t.kind === "member"
            ? void mutations.renameMember(t.id, name)
            : void mutations.renameCategory(t.id, name)
        }
      />

      <AlertDialog open={deleting !== null} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this category?</AlertDialogTitle>
            <AlertDialogDescription>
              &ldquo;{deleting?.name}&rdquo; will be removed. Events keep their data but
              lose this category label. This can&apos;t be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deleting) void mutations.deleteCategory(deleting.id);
                setDeleting(null);
              }}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

/**
 * Desktop-only left rail. Hidden on phones (< md), where the same controls are
 * presented as a bottom sheet (see CalendarFiltersSheet).
 */
export function CalendarSidebar(props: FiltersProps) {
  return (
    <aside className="hidden w-60 shrink-0 flex-col gap-5 overflow-y-auto border-r bg-sidebar p-3 md:flex">
      <CalendarFiltersContent {...props} />
    </aside>
  );
}

/** Shared rename dialog for a calendar (own member) or category. */
function RenameDialog({
  target,
  onClose,
  onSubmit,
}: {
  target: RenameTarget | null;
  onClose: () => void;
  onSubmit: (target: RenameTarget, name: string) => void;
}) {
  return (
    <ResponsiveDialog open={target !== null} onOpenChange={(o) => !o && onClose()}>
      <ResponsiveDialogContent>
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle>
            {target?.kind === "member" ? "Rename calendar" : "Rename category"}
          </ResponsiveDialogTitle>
          <ResponsiveDialogDescription className="sr-only">
            Enter a new name.
          </ResponsiveDialogDescription>
        </ResponsiveDialogHeader>
        {/* Keyed per target so the field re-initialises to the current name without a sync effect. */}
        {target && (
          <RenameForm key={target.id} target={target} onClose={onClose} onSubmit={onSubmit} />
        )}
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}

function RenameForm({
  target,
  onClose,
  onSubmit,
}: {
  target: RenameTarget;
  onClose: () => void;
  onSubmit: (target: RenameTarget, name: string) => void;
}) {
  const [name, setName] = React.useState(target.name);

  const save = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    onSubmit(target, trimmed);
    onClose();
  };

  return (
    <>
      <ResponsiveDialogBody className="py-3">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && save()}
          autoFocus
        />
      </ResponsiveDialogBody>
      <ResponsiveDialogFooter>
        <Button variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={save} disabled={!name.trim()}>
          Save
        </Button>
      </ResponsiveDialogFooter>
    </>
  );
}

function AddCategoryPopover({ workspaceId }: { workspaceId: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const [color, setColor] = React.useState(PALETTE[0]);
  const [pending, setPending] = React.useState(false);

  async function add() {
    if (!name.trim()) return;
    setPending(true);
    try {
      await createCategory(createClient(), {
        workspaceId,
        ownerId: null,
        name: name.trim(),
        color,
      });
      await qc.invalidateQueries({ queryKey: qk.workspace });
      setName("");
      setColor(PALETTE[0]);
      setOpen(false);
    } finally {
      setPending(false);
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="size-6" aria-label="Add category">
          <Plus />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64">
        <div className="flex flex-col gap-3">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Category name"
            onKeyDown={(e) => e.key === "Enter" && add()}
            autoFocus
          />
          <div className="flex flex-wrap gap-1.5">
            {PALETTE.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={`Color ${c}`}
                onClick={() => setColor(c)}
                className={cn(
                  "size-6 rounded-full ring-offset-2 ring-offset-popover",
                  color === c && "ring-2 ring-foreground",
                )}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
          <Button onClick={add} disabled={pending || !name.trim()} size="sm">
            Add category
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
