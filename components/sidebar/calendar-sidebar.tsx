"use client";

import * as React from "react";
import { Plus, SquarePen, Focus, Eye, Trash2, CalendarPlus, Users, User } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
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
import { useSidebarWidth, SidebarResizeHandle } from "@/lib/hooks/use-sidebar-width";
import { qk } from "@/lib/supabase/query-keys";
import { useUiStore } from "@/stores/ui-store";
import { cn } from "@/lib/utils";
import { localTimeZone } from "@/lib/datetime/local";
import { toPaletteColor } from "@/lib/theme/appearance";
import type { Member, Category } from "@/lib/types";
import { CONTEXT_PALETTE as PALETTE } from "@/lib/contexts/palette";

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
    /** trailing indicator (e.g. the Shared-context glyph) shown before the menu */
    badge?: React.ReactNode;
    /** when set (mobile), render the ⋮ affordance that opens the action sheet */
    onMenu?: () => void;
  } & React.HTMLAttributes<HTMLDivElement>
>(function ToggleRow({ color, label, active, onToggle, badge, onMenu, className, ...rest }, ref) {
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
            backgroundColor: active ? toPaletteColor(color) : "transparent",
            borderColor: toPaletteColor(color),
          }}
        />
        <span className={cn("truncate", !active && "text-muted-foreground line-through")}>
          {label}
        </span>
      </button>
      {badge}
      {onMenu && <ItemMenuButton onMenu={onMenu} className="mr-1 size-9" />}
    </div>
  );
});

/** Trailing glyph marking a Context as Shared (joint events; both can edit). */
function SharedBadge() {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className="mr-0.5 flex size-7 shrink-0 items-center justify-center text-muted-foreground"
          aria-label="Shared context — both attend and can edit"
        >
          <Users className="size-3.5" />
        </span>
      </TooltipTrigger>
      <TooltipContent>Shared — you both attend and can edit</TooltipContent>
    </Tooltip>
  );
}

/**
 * A non-toggle calendar row (the signed-in member's own calendar, which is
 * always shown). The colour dot is a legend; the row still hosts the right-click
 * / ⋮ menu for rename + recolor.
 */
const LegendRow = React.forwardRef<
  HTMLDivElement,
  { color: string; label: string; onMenu?: () => void } & React.HTMLAttributes<HTMLDivElement>
>(function LegendRow({ color, label, onMenu, className, ...rest }, ref) {
  return (
    <div
      ref={ref}
      className={cn("flex items-center rounded-md hover:bg-sidebar-accent", className)}
      {...rest}
    >
      <span className="flex min-h-11 flex-1 items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-sm md:min-h-0">
        <span
          className="size-3.5 shrink-0 rounded-[4px]"
          style={{ backgroundColor: toPaletteColor(color) }}
        />
        <span className="truncate">{label}</span>
      </span>
      {onMenu && <ItemMenuButton onMenu={onMenu} className="mr-1 size-9" />}
    </div>
  );
});

/**
 * Layer + category filter controls, shared by the desktop sidebar and the
 * mobile bottom sheet so the two presentations never drift apart.
 *
 * My own calendar is always shown; other members are overlaid onto it only when
 * toggled on. Each row carries a right-click (desktop) / long-press ⋮ (mobile)
 * menu: the signed-in member's own row gets rename + recolor (RLS restricts
 * member edits to the self row); categories get rename, recolor,
 * show-only/show-all, and delete.
 */
export function CalendarFiltersContent({
  workspaceId,
  currentMemberId,
  members,
  categories,
}: FiltersProps) {
  const overlayMemberIds = useUiStore((s) => s.overlayMemberIds);
  const hiddenCategoryIds = useUiStore((s) => s.hiddenCategoryIds);
  const toggleOverlay = useUiStore((s) => s.toggleOverlay);
  const toggleCategory = useUiStore((s) => s.toggleCategory);
  const setHiddenCategoryIds = useUiStore((s) => s.setHiddenCategoryIds);
  const mutations = useSidebarMutations(workspaceId);

  const [renaming, setRenaming] = React.useState<RenameTarget | null>(null);
  const [deleting, setDeleting] = React.useState<{ id: string; name: string } | null>(null);
  const [converting, setConverting] = React.useState<
    { id: string; name: string; toShared: boolean } | null
  >(null);

  const ownMember = members.find((m) => m.id === currentMemberId) ?? null;
  const otherMembers = members.filter((m) => m.id !== currentMemberId);
  const otherName = otherMembers[0]?.name ?? "the other member";

  /** Give a Context a default time-block on the calendar. */
  function addToCalendar(c: Category) {
    void mutations.addContextWindow(c.id, {
      ownerId: currentMemberId,
      timeZone: ownMember?.timezone ?? localTimeZone(),
      title: c.name,
    });
  }

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
          My calendar
        </h3>
        {ownMember && (
          <ItemContextMenu
            title={ownMember.name}
            color={ownMember.color}
            onColorChange={(c) => c && void mutations.recolorMember(ownMember.id, c)}
            actions={[
              {
                label: "Rename",
                icon: SquarePen,
                onSelect: () =>
                  setRenaming({ kind: "member", id: ownMember.id, name: ownMember.name }),
              },
            ]}
          >
            {/* Own calendar is always shown ("my normal view"); the dot is just a colour legend. */}
            <LegendRow color={ownMember.color} label={ownMember.name} />
          </ItemContextMenu>
        )}
      </section>

      {otherMembers.length > 0 && (
        <section className="flex flex-col gap-0.5">
          <h3 className="px-2 pb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Other calendars
          </h3>
          {otherMembers.map((m) => (
            <ToggleRow
              key={m.id}
              color={m.color}
              label={m.name}
              active={overlayMemberIds.has(m.id)}
              onToggle={() => toggleOverlay(m.id)}
            />
          ))}
        </section>
      )}

      <section className="flex flex-col gap-0.5">
        <div className="flex items-center justify-between px-2 pb-1">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Contexts
          </h3>
          <AddCategoryPopover workspaceId={workspaceId} currentMemberId={currentMemberId} />
        </div>
        {categories.length === 0 ? (
          <p className="px-2 text-xs text-muted-foreground">No contexts yet</p>
        ) : (
          categories.map((c) => {
            const shared = c.ownerId === null;
            return (
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
                  {
                    label: "Add to calendar",
                    icon: CalendarPlus,
                    onSelect: () => addToCalendar(c),
                  },
                  shared
                    ? {
                        label: "Make personal",
                        icon: User,
                        onSelect: () =>
                          setConverting({ id: c.id, name: c.name, toShared: false }),
                      }
                    : {
                        label: "Make shared",
                        icon: Users,
                        onSelect: () =>
                          setConverting({ id: c.id, name: c.name, toShared: true }),
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
                  badge={shared ? <SharedBadge /> : undefined}
                />
              </ItemContextMenu>
            );
          })
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
            <AlertDialogTitle>Delete this context?</AlertDialogTitle>
            <AlertDialogDescription>
              &ldquo;{deleting?.name}&rdquo; and its calendar time-blocks will be
              removed; its items become uncategorized. You can undo this.
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

      <AlertDialog open={converting !== null} onOpenChange={(o) => !o && setConverting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {converting?.toShared ? "Make this context shared?" : "Make this context personal?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {converting?.toShared ? (
                <>
                  You&rsquo;ll both see and edit every event in &ldquo;{converting?.name}&rdquo;,
                  and they&rsquo;ll show on both calendars.
                </>
              ) : (
                <>
                  &ldquo;{converting?.name}&rdquo; returns to your calendar only. Events {otherName}{" "}
                  added here stay theirs and leave your shared view.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (converting)
                  void mutations.makeContextShared(
                    converting.id,
                    converting.toShared ? null : currentMemberId,
                  );
                setConverting(null);
              }}
            >
              {converting?.toShared ? "Make shared" : "Make personal"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

/**
 * Desktop-only left rail. Hidden on phones (< md), where the same controls are
 * presented as a bottom sheet (see CalendarFiltersSheet). Drag the inner edge to
 * resize; the width is remembered per device + per user.
 */
export function CalendarSidebar(props: FiltersProps) {
  const { width, beginResize } = useSidebarWidth("left", props.currentMemberId);
  return (
    <aside
      style={{ width }}
      className="relative hidden shrink-0 flex-col border-r bg-sidebar md:flex"
    >
      <div className="flex flex-1 flex-col gap-5 overflow-y-auto p-3">
        <CalendarFiltersContent {...props} />
      </div>
      <SidebarResizeHandle side="left" onPointerDown={beginResize} />
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
            {target?.kind === "member" ? "Rename calendar" : "Rename context"}
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

function AddCategoryPopover({
  workspaceId,
  currentMemberId,
}: {
  workspaceId: string;
  currentMemberId: string;
}) {
  const qc = useQueryClient();
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const [color, setColor] = React.useState<string>(PALETTE[0]);
  // Default to Shared: it preserves today's behavior (every context was shared)
  // and is the common case for a two-person planner.
  const [shared, setShared] = React.useState(true);
  const [pending, setPending] = React.useState(false);

  async function add() {
    if (!name.trim()) return;
    setPending(true);
    try {
      await createCategory(createClient(), {
        workspaceId,
        ownerId: shared ? null : currentMemberId,
        name: name.trim(),
        color,
      });
      await qc.invalidateQueries({ queryKey: qk.workspace });
      setName("");
      setColor(PALETTE[0]);
      setShared(true);
      setOpen(false);
    } finally {
      setPending(false);
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="size-6" aria-label="Add context">
          <Plus />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64">
        <div className="flex flex-col gap-3">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Context name"
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
                style={{ backgroundColor: toPaletteColor(c) }}
              />
            ))}
          </div>
          <label className="flex items-center justify-between gap-2 text-sm">
            <span className="flex items-center gap-2">
              {shared ? (
                <Users className="size-4 text-muted-foreground" />
              ) : (
                <User className="size-4 text-muted-foreground" />
              )}
              <span>{shared ? "Shared" : "Personal"}</span>
            </span>
            <Switch
              checked={shared}
              onCheckedChange={setShared}
              aria-label="Shared context — you both attend and can edit"
            />
          </label>
          <p className="text-xs text-muted-foreground">
            {shared
              ? "You both attend and can edit every event in it."
              : "Only on your calendar; only you can edit its events."}
          </p>
          <Button onClick={add} disabled={pending || !name.trim()} size="sm">
            Add context
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
