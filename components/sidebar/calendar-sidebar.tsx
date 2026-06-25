"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Plus, SquarePen, Focus, Eye, Trash2, CalendarPlus, Users, User, Tags } from "lucide-react";
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
        "flex items-center rounded-md transition-colors duration-150 ease-out-quint hover:bg-sidebar-accent motion-reduce:transition-none",
        className,
      )}
      {...rest}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-pressed={active}
        className="flex min-h-11 flex-1 items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-sm outline-none transition-[transform,background-color] duration-150 ease-out-quint focus-visible:ring-3 focus-visible:ring-ring/30 active:translate-y-px active:bg-sidebar-accent motion-reduce:transition-none md:min-h-0"
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
  const t = useTranslations("calendar");
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className="mr-0.5 flex size-7 shrink-0 items-center justify-center text-muted-foreground"
          aria-label={t("sidebar.sharedBadgeAria")}
        >
          <Users className="size-3.5" />
        </span>
      </TooltipTrigger>
      <TooltipContent>{t("sidebar.sharedBadgeTooltip")}</TooltipContent>
    </Tooltip>
  );
}

/**
 * Layer + category filter controls, shared by the desktop sidebar and the
 * mobile bottom sheet so the two presentations never drift apart.
 *
 * My own calendar is shown by default but can be toggled off (to review only
 * the other member's / shared events); other members are overlaid onto it only
 * when toggled on. Each row carries a right-click (desktop) / long-press ⋮ (mobile)
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
  const ownCalendarHidden = useUiStore((s) => s.ownCalendarHidden);
  const toggleOverlay = useUiStore((s) => s.toggleOverlay);
  const toggleOwnCalendar = useUiStore((s) => s.toggleOwnCalendar);
  const toggleCategory = useUiStore((s) => s.toggleCategory);
  const setHiddenCategoryIds = useUiStore((s) => s.setHiddenCategoryIds);
  const mutations = useSidebarMutations(workspaceId);
  const t = useTranslations("calendar");
  const tc = useTranslations("common");

  const [renaming, setRenaming] = React.useState<RenameTarget | null>(null);
  const [deleting, setDeleting] = React.useState<{ id: string; name: string } | null>(null);
  const [converting, setConverting] = React.useState<
    { id: string; name: string; toShared: boolean } | null
  >(null);

  const ownMember = members.find((m) => m.id === currentMemberId) ?? null;
  const otherMembers = members.filter((m) => m.id !== currentMemberId);
  const otherName = otherMembers[0]?.name ?? t("sidebar.theOtherMember");

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
      label: t("sidebar.menu.showOnly"),
      icon: Focus,
      onSelect: () =>
        setHiddenCategoryIds(
          new Set(categories.filter((c) => c.id !== id).map((c) => c.id)),
        ),
    },
    { label: t("sidebar.menu.showAll"), icon: Eye, onSelect: () => setHiddenCategoryIds(new Set()) },
  ];

  return (
    <>
      <section className="flex flex-col gap-0.5">
        <h3 className="px-2 pb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {t("sidebar.myCalendar")}
        </h3>
        {ownMember && (
          <ItemContextMenu
            title={ownMember.name}
            color={ownMember.color}
            onColorChange={(c) => c && void mutations.recolorMember(ownMember.id, c)}
            actions={[
              {
                label: t("sidebar.menu.rename"),
                icon: SquarePen,
                onSelect: () =>
                  setRenaming({ kind: "member", id: ownMember.id, name: ownMember.name }),
              },
            ]}
          >
            {/* Toggle my own calendar off to review only the other member's / shared events. */}
            <ToggleRow
              color={ownMember.color}
              label={ownMember.name}
              active={!ownCalendarHidden}
              onToggle={toggleOwnCalendar}
            />
          </ItemContextMenu>
        )}
      </section>

      {otherMembers.length > 0 && (
        <section className="flex flex-col gap-0.5">
          <h3 className="px-2 pb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {t("sidebar.otherCalendars")}
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
            {t("sidebar.contexts")}
          </h3>
          <AddCategoryPopover workspaceId={workspaceId} currentMemberId={currentMemberId} />
        </div>
        {categories.length === 0 ? (
          <div className="flex flex-col items-center gap-1.5 px-2 py-6 text-center">
            <Tags aria-hidden className="size-5 text-muted-foreground" />
            <p className="text-sm text-foreground">{t("sidebar.noContextsYet")}</p>
            <p className="max-w-[26ch] text-pretty text-xs text-muted-foreground">
              {t("sidebar.noContextsHint")}
            </p>
          </div>
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
                    label: t("sidebar.menu.rename"),
                    icon: SquarePen,
                    onSelect: () => setRenaming({ kind: "category", id: c.id, name: c.name }),
                  },
                  {
                    label: t("sidebar.menu.addToCalendar"),
                    icon: CalendarPlus,
                    onSelect: () => addToCalendar(c),
                  },
                  shared
                    ? {
                        label: t("sidebar.menu.makePersonal"),
                        icon: User,
                        onSelect: () =>
                          setConverting({ id: c.id, name: c.name, toShared: false }),
                      }
                    : {
                        label: t("sidebar.menu.makeShared"),
                        icon: Users,
                        onSelect: () =>
                          setConverting({ id: c.id, name: c.name, toShared: true }),
                      },
                  ...categoryVisibility(c.id),
                  {
                    label: t("sidebar.menu.delete"),
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
            <AlertDialogTitle>{t("sidebar.deleteContext.title")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("sidebar.deleteContext.description", { name: deleting?.name ?? "" })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tc("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deleting) void mutations.deleteCategory(deleting.id);
                setDeleting(null);
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {tc("delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={converting !== null} onOpenChange={(o) => !o && setConverting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {converting?.toShared
                ? t("sidebar.convert.makeSharedTitle")
                : t("sidebar.convert.makePersonalTitle")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {converting?.toShared
                ? t("sidebar.convert.makeSharedDescription", { name: converting?.name ?? "" })
                : t("sidebar.convert.makePersonalDescription", {
                    name: converting?.name ?? "",
                    otherName,
                  })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tc("cancel")}</AlertDialogCancel>
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
              {converting?.toShared
                ? t("sidebar.menu.makeShared")
                : t("sidebar.menu.makePersonal")}
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
export function CalendarSidebar({ open, ...props }: FiltersProps & { open: boolean }) {
  const { width, beginResize, nudge, resizing } = useSidebarWidth("left", props.currentMemberId);
  return (
    <aside
      // Width-wipe on open/close (the grid absorbs the freed space); the transition
      // is suppressed mid-resize so dragging the edge stays 1:1 with the pointer.
      style={{ width: open ? width : 0 }}
      aria-hidden={!open ? true : undefined}
      inert={!open ? true : undefined}
      className={cn(
        "relative hidden shrink-0 flex-col overflow-hidden bg-sidebar md:flex",
        !resizing && "transition-[width] duration-200 ease-out-quint motion-reduce:transition-none",
      )}
    >
      {/* Pinned to the open width + border on the inner edge, so the content clips
          cleanly under overflow-hidden as the panel collapses (no squish, no 1px
          phantom border at width 0). Fades with the wipe. */}
      <div
        style={{ width }}
        className={cn(
          "flex flex-1 flex-col gap-5 overflow-y-auto border-r p-3 transition-opacity duration-200 ease-out-quint motion-reduce:transition-none",
          open ? "opacity-100" : "opacity-0",
        )}
      >
        <CalendarFiltersContent {...props} />
      </div>
      <SidebarResizeHandle side="left" width={width} onPointerDown={beginResize} onNudge={nudge} />
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
  const t = useTranslations("calendar");
  return (
    <ResponsiveDialog open={target !== null} onOpenChange={(o) => !o && onClose()}>
      <ResponsiveDialogContent>
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle>
            {target?.kind === "member"
              ? t("sidebar.rename.renameCalendar")
              : t("sidebar.rename.renameContext")}
          </ResponsiveDialogTitle>
          <ResponsiveDialogDescription className="sr-only">
            {t("sidebar.rename.enterNewName")}
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
  const tc = useTranslations("common");
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
          {tc("cancel")}
        </Button>
        <Button onClick={save} disabled={!name.trim()}>
          {tc("save")}
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
  const t = useTranslations("calendar");
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
        <Button variant="ghost" size="icon" className="size-6" aria-label={t("sidebar.addContext")}>
          <Plus />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64">
        <div className="flex flex-col gap-3">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("sidebar.contextName")}
            onKeyDown={(e) => e.key === "Enter" && add()}
            autoFocus
          />
          <div className="flex flex-wrap gap-1">
            {PALETTE.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={t("sidebar.colorAria", { color: c })}
                aria-pressed={color === c}
                onClick={() => setColor(c)}
                // Centered hit box (≥44px on touch) around the 24px swatch, so the
                // tap target clears the minimum without enlarging the dot itself.
                className="group flex size-9 items-center justify-center rounded-full outline-none transition-transform duration-150 ease-out-quint active:scale-[0.96] motion-reduce:transition-none max-sm:size-11"
              >
                <span
                  className={cn(
                    "size-6 rounded-full ring-offset-2 ring-offset-popover transition-shadow duration-150",
                    color === c
                      ? "ring-2 ring-foreground"
                      : "group-focus-visible:ring-2 group-focus-visible:ring-ring",
                  )}
                  style={{ backgroundColor: toPaletteColor(c) }}
                />
              </button>
            ))}
          </div>
          <label className="flex items-center justify-between gap-2 text-sm">
            <span className="flex items-center gap-2">
              {shared ? (
                <Users className="size-4 text-muted-foreground" />
              ) : (
                <User className="size-4 text-muted-foreground" />
              )}
              <span>{shared ? t("sidebar.shared") : t("sidebar.personal")}</span>
            </span>
            <Switch
              checked={shared}
              onCheckedChange={setShared}
              aria-label={t("sidebar.sharedToggleAria")}
            />
          </label>
          <p className="text-xs text-muted-foreground">
            {shared ? t("sidebar.sharedHelp") : t("sidebar.personalHelp")}
          </p>
          <Button onClick={add} disabled={pending || !name.trim()} size="sm">
            {t("sidebar.addContext")}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
