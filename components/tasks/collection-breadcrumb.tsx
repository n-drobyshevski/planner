"use client";

import * as React from "react";
import {
  ChevronRight,
  ChevronDown,
  Plus,
  Pencil,
  Trash2,
  Check,
  Users,
  User,
  MoreHorizontal,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
} from "@/components/ui/dropdown-menu";
import {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
} from "@/components/ui/context-menu";
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
import { cn } from "@/lib/utils";
import { useCollectionMutations } from "@/lib/hooks/use-collection-mutations";
import { CollectionDialog } from "./collection-dialog";
import { Dot, CollectionLine } from "./collection-glyphs";
import type { Collection } from "@/lib/types";

/**
 * Run a follow-up action on the next tick. The right-click ContextMenu is
 * non-modal (see ItemContextMenu), so Radix returns focus to the trigger as the
 * menu tears down on `onSelect`; opening a dialog on the same tick races that
 * and can flicker it shut. Deferring one tick lets the menu finish closing.
 */
function defer(fn: () => void) {
  setTimeout(fn, 0);
}

/**
 * The in-view collection control: a breadcrumb (`Tasks › Collection`) whose
 * collection segment opens a menu to switch collections and manage *any*
 * collection (edit / share / delete) — by left-click (full menu) or right-click /
 * long-press (quick actions on the current collection). Shown across every view
 * (Board / List / Flows); reuses CollectionDialog + useCollectionMutations, so a
 * collection is managed identically wherever you reach it from.
 */
export function CollectionBreadcrumb({
  collections,
  activeCollectionId,
  onActiveCollectionChange,
  taskCountByCollection,
  workspaceId,
  currentMemberId,
}: {
  collections: Collection[];
  activeCollectionId: string | null;
  onActiveCollectionChange: (collectionId: string) => void;
  /** Task count (incl. subtasks) per collection id — for the delete guard. */
  taskCountByCollection: Map<string, number>;
  workspaceId: string;
  currentMemberId: string;
}) {
  const t = useTranslations("tasks");
  const tc = useTranslations("common");
  const mutations = useCollectionMutations();

  const [createOpen, setCreateOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Collection | null>(null);
  const [deleting, setDeleting] = React.useState<Collection | null>(null);

  const active =
    collections.find((c) => c.id === activeCollectionId) ?? collections[0] ?? null;
  const deletingCount = deleting ? taskCountByCollection.get(deleting.id) ?? 0 : 0;

  function toggleShared(c: Collection) {
    void mutations.setShared(c.id, c.ownerId === null ? currentMemberId : null);
  }

  async function confirmDelete() {
    if (!deleting || deletingCount > 0) return;
    const deletedId = deleting.id;
    const ok = await mutations.remove(deletedId);
    setDeleting(null);
    if (ok && deletedId === active?.id) {
      const next = collections.find((c) => c.id !== deletedId);
      if (next) onActiveCollectionChange(next.id);
    }
  }

  // The view only mounts the breadcrumb once a collection exists, but stay safe.
  if (!active) return null;

  return (
    <nav
      aria-label={t("breadcrumb.label")}
      className="flex shrink-0 items-center gap-1.5 px-4 pt-3 pb-2 sm:px-6"
    >
      <span className="text-sm text-muted-foreground">{t("breadcrumb.root")}</span>
      <ChevronRight aria-hidden className="size-3.5 shrink-0 text-muted-foreground/60" />

      <DropdownMenu>
        <ContextMenu modal={false}>
          <ContextMenuTrigger asChild>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="-ml-1 h-8 max-w-[12rem] gap-1.5 px-2 sm:max-w-[22rem]"
              >
                <Dot color={active.color} />
                <span className="truncate font-heading font-semibold">
                  {active.name}
                </span>
                <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
              </Button>
            </DropdownMenuTrigger>
          </ContextMenuTrigger>

          {/* Right-click / long-press: quick actions on the current collection. */}
          <ContextMenuContent className="w-56">
            <ContextMenuItem onSelect={() => defer(() => setEditing(active))}>
              <Pencil />
              {t("switcher.edit", { name: active.name })}
            </ContextMenuItem>
            <ContextMenuItem onSelect={() => defer(() => toggleShared(active))}>
              {active.ownerId === null ? <User /> : <Users />}
              {active.ownerId === null
                ? t("switcher.makePersonal")
                : t("switcher.makeShared")}
            </ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem
              variant="destructive"
              onSelect={() => defer(() => setDeleting(active))}
            >
              <Trash2 />
              {t("switcher.delete", { name: active.name })}
            </ContextMenuItem>
          </ContextMenuContent>
        </ContextMenu>

        {/* Left-click: switch any collection + manage any collection. */}
        <DropdownMenuContent align="start" className="w-64">
          <DropdownMenuLabel>{t("switcher.collections")}</DropdownMenuLabel>
          {collections.map((c) => (
            <div key={c.id} className="flex items-center gap-0.5">
              <DropdownMenuItem
                className="min-w-0 flex-1"
                onSelect={() => onActiveCollectionChange(c.id)}
              >
                <CollectionLine collection={c} />
                <span className="flex-1 truncate">{c.name}</span>
                {c.ownerId === null ? (
                  <Users className="size-3.5 text-muted-foreground" />
                ) : (
                  <User className="size-3.5 text-muted-foreground" />
                )}
                <Check
                  className={cn(
                    "size-4",
                    c.id === active.id ? "opacity-100" : "opacity-0",
                  )}
                />
              </DropdownMenuItem>
              <DropdownMenuSub>
                <DropdownMenuSubTrigger
                  aria-label={t("breadcrumb.manageCollection", { name: c.name })}
                  className="size-8 shrink-0 justify-center p-0 [&>svg:last-of-type]:hidden"
                >
                  <MoreHorizontal />
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent className="w-48">
                  <DropdownMenuItem onSelect={() => setEditing(c)}>
                    <Pencil data-icon="inline-start" />
                    {t("switcher.edit", { name: c.name })}
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => toggleShared(c)}>
                    {c.ownerId === null ? (
                      <User data-icon="inline-start" />
                    ) : (
                      <Users data-icon="inline-start" />
                    )}
                    {c.ownerId === null
                      ? t("switcher.makePersonal")
                      : t("switcher.makeShared")}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    variant="destructive"
                    onSelect={() => setDeleting(c)}
                  >
                    <Trash2 data-icon="inline-start" />
                    {t("switcher.delete", { name: c.name })}
                  </DropdownMenuItem>
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            </div>
          ))}

          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setCreateOpen(true)}>
            <Plus data-icon="inline-start" />
            {t("switcher.newCollection")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <CollectionDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        mode="create"
        workspaceId={workspaceId}
        currentMemberId={currentMemberId}
        onCreated={onActiveCollectionChange}
      />
      <CollectionDialog
        open={editing !== null}
        onOpenChange={(o) => !o && setEditing(null)}
        mode="edit"
        collection={editing}
        workspaceId={workspaceId}
        currentMemberId={currentMemberId}
      />

      <AlertDialog
        open={deleting !== null}
        onOpenChange={(o) => !o && setDeleting(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {deletingCount > 0
                ? t("switcher.notEmptyTitle")
                : t("switcher.deleteTitle", { name: deleting?.name ?? "" })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {deletingCount > 0
                ? t("switcher.notEmptyDescription", { count: deletingCount })
                : t("switcher.deleteDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>
              {deletingCount > 0 ? tc("close") : tc("cancel")}
            </AlertDialogCancel>
            {deletingCount === 0 && (
              <AlertDialogAction
                onClick={confirmDelete}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {tc("delete")}
              </AlertDialogAction>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </nav>
  );
}
