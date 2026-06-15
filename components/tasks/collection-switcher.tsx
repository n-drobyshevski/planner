"use client";

import * as React from "react";
import {
  ChevronDown,
  Plus,
  Pencil,
  Trash2,
  Check,
  Users,
  User,
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
} from "@/components/ui/dropdown-menu";
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
import { useWorkspace } from "@/lib/hooks/use-workspace";
import { useCollectionMutations } from "@/lib/hooks/use-collection-mutations";
import { CollectionDialog } from "./collection-dialog";
import { Dot, CollectionLine } from "./collection-glyphs";
import type { Collection } from "@/lib/types";

/**
 * The collection picker that sits at the left of the Tasks toolbar: shows the
 * active collection, switches between collections, and hosts create / edit /
 * delete. Pulls its own data (collections from the workspace bundle, task counts
 * from useTasks) so the toolbar only has to pass the active id and a change
 * handler.
 */
export function CollectionSwitcher({
  activeCollectionId,
  onActiveCollectionChange,
  taskCountByCollection,
}: {
  activeCollectionId: string | null;
  onActiveCollectionChange: (collectionId: string) => void;
  /** Task count (incl. subtasks) per collection id — for the delete guard. */
  taskCountByCollection: Map<string, number>;
}) {
  const t = useTranslations("tasks");
  const tc = useTranslations("common");
  const ws = useWorkspace();
  const workspaceId = ws.data?.workspaceId;
  const currentMember = ws.data?.currentMember ?? null;
  const collections = ws.data?.collections ?? [];
  const mutations = useCollectionMutations();

  const [createOpen, setCreateOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Collection | null>(null);
  const [deleting, setDeleting] = React.useState<Collection | null>(null);

  const active =
    collections.find((c) => c.id === activeCollectionId) ?? collections[0] ?? null;

  const deletingCount = deleting ? taskCountByCollection.get(deleting.id) ?? 0 : 0;

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

  // No collections yet — offer to create the first one.
  if (collections.length === 0) {
    return (
      <>
        <Button variant="outline" size="sm" onClick={() => setCreateOpen(true)}>
          <Plus data-icon="inline-start" />
          {t("switcher.newCollection")}
        </Button>
        {workspaceId && currentMember && (
          <CollectionDialog
            open={createOpen}
            onOpenChange={setCreateOpen}
            mode="create"
            workspaceId={workspaceId}
            currentMemberId={currentMember.id}
            onCreated={onActiveCollectionChange}
          />
        )}
      </>
    );
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="max-w-[10rem] gap-1.5 px-2 sm:max-w-[16rem]"
          >
            {active && <Dot color={active.color} />}
            <span className="truncate font-heading font-semibold">
              {active?.name ?? t("switcher.collections")}
            </span>
            <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-60">
          <DropdownMenuLabel>{t("switcher.collections")}</DropdownMenuLabel>
          {collections.map((c) => (
            <DropdownMenuItem
              key={c.id}
              onSelect={() => onActiveCollectionChange(c.id)}
              className="gap-2"
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
                  c.id === active?.id ? "opacity-100" : "opacity-0",
                )}
              />
            </DropdownMenuItem>
          ))}

          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setCreateOpen(true)}>
            <Plus data-icon="inline-start" />
            {t("switcher.newCollection")}
          </DropdownMenuItem>
          {active && (
            <>
              <DropdownMenuItem onSelect={() => setEditing(active)}>
                <Pencil data-icon="inline-start" />
                {t("switcher.edit", { name: active.name })}
              </DropdownMenuItem>
              {currentMember && (
                <DropdownMenuItem
                  onSelect={() =>
                    void mutations.setShared(
                      active.id,
                      active.ownerId === null ? currentMember.id : null,
                    )
                  }
                >
                  {active.ownerId === null ? (
                    <User data-icon="inline-start" />
                  ) : (
                    <Users data-icon="inline-start" />
                  )}
                  {active.ownerId === null
                    ? t("switcher.makePersonal")
                    : t("switcher.makeShared")}
                </DropdownMenuItem>
              )}
              <DropdownMenuItem
                variant="destructive"
                onSelect={() => setDeleting(active)}
              >
                <Trash2 data-icon="inline-start" />
                {t("switcher.delete", { name: active.name })}
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {workspaceId && currentMember && (
        <>
          <CollectionDialog
            open={createOpen}
            onOpenChange={setCreateOpen}
            mode="create"
            workspaceId={workspaceId}
            currentMemberId={currentMember.id}
            onCreated={onActiveCollectionChange}
          />
          <CollectionDialog
            open={editing !== null}
            onOpenChange={(o) => !o && setEditing(null)}
            mode="edit"
            collection={editing}
            workspaceId={workspaceId}
            currentMemberId={currentMember.id}
          />
        </>
      )}

      <AlertDialog open={deleting !== null} onOpenChange={(o) => !o && setDeleting(null)}>
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
            <AlertDialogCancel>{deletingCount > 0 ? tc("close") : tc("cancel")}</AlertDialogCancel>
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
    </>
  );
}
