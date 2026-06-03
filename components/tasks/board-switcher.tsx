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
import { toPaletteColor } from "@/lib/theme/appearance";
import { useWorkspace } from "@/lib/hooks/use-workspace";
import { useBoardMutations } from "@/lib/hooks/use-board-mutations";
import { BoardDialog } from "./board-dialog";
import type { Board } from "@/lib/types";

/** A small filled circle in a board's color. */
function Dot({ color }: { color: string }) {
  return (
    <span
      className="size-2.5 shrink-0 rounded-full"
      style={{ backgroundColor: toPaletteColor(color) }}
    />
  );
}

/**
 * The board picker that sits at the left of the Tasks toolbar: shows the active
 * board, switches between boards, and hosts create / edit / delete. Pulls its
 * own data (boards from the workspace bundle, task counts from useTasks) so the
 * toolbar only has to pass the active id and a change handler.
 */
export function BoardSwitcher({
  activeBoardId,
  onActiveBoardChange,
  taskCountByBoard,
}: {
  activeBoardId: string | null;
  onActiveBoardChange: (boardId: string) => void;
  /** Task count (incl. subtasks) per board id — for the delete guard. */
  taskCountByBoard: Map<string, number>;
}) {
  const ws = useWorkspace();
  const workspaceId = ws.data?.workspaceId;
  const currentMember = ws.data?.currentMember ?? null;
  const boards = ws.data?.boards ?? [];
  const mutations = useBoardMutations();

  const [createOpen, setCreateOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Board | null>(null);
  const [deleting, setDeleting] = React.useState<Board | null>(null);

  const active = boards.find((b) => b.id === activeBoardId) ?? boards[0] ?? null;

  const deletingCount = deleting ? taskCountByBoard.get(deleting.id) ?? 0 : 0;

  async function confirmDelete() {
    if (!deleting || deletingCount > 0) return;
    const deletedId = deleting.id;
    const ok = await mutations.remove(deletedId);
    setDeleting(null);
    if (ok && deletedId === active?.id) {
      const next = boards.find((b) => b.id !== deletedId);
      if (next) onActiveBoardChange(next.id);
    }
  }

  // No boards yet — offer to create the first one.
  if (boards.length === 0) {
    return (
      <>
        <Button variant="outline" size="sm" onClick={() => setCreateOpen(true)}>
          <Plus data-icon="inline-start" />
          New board
        </Button>
        {workspaceId && currentMember && (
          <BoardDialog
            open={createOpen}
            onOpenChange={setCreateOpen}
            mode="create"
            workspaceId={workspaceId}
            currentMemberId={currentMember.id}
            onCreated={onActiveBoardChange}
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
              {active?.name ?? "Boards"}
            </span>
            <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-60">
          <DropdownMenuLabel>Boards</DropdownMenuLabel>
          {boards.map((b) => (
            <DropdownMenuItem
              key={b.id}
              onSelect={() => onActiveBoardChange(b.id)}
              className="gap-2"
            >
              <Dot color={b.color} />
              <span className="flex-1 truncate">{b.name}</span>
              {b.ownerId === null ? (
                <Users className="size-3.5 text-muted-foreground" />
              ) : (
                <User className="size-3.5 text-muted-foreground" />
              )}
              <Check
                className={cn(
                  "size-4",
                  b.id === active?.id ? "opacity-100" : "opacity-0",
                )}
              />
            </DropdownMenuItem>
          ))}

          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setCreateOpen(true)}>
            <Plus data-icon="inline-start" />
            New board
          </DropdownMenuItem>
          {active && (
            <>
              <DropdownMenuItem onSelect={() => setEditing(active)}>
                <Pencil data-icon="inline-start" />
                Edit “{active.name}”
              </DropdownMenuItem>
              <DropdownMenuItem
                variant="destructive"
                onSelect={() => setDeleting(active)}
              >
                <Trash2 data-icon="inline-start" />
                Delete “{active.name}”
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {workspaceId && currentMember && (
        <>
          <BoardDialog
            open={createOpen}
            onOpenChange={setCreateOpen}
            mode="create"
            workspaceId={workspaceId}
            currentMemberId={currentMember.id}
            onCreated={onActiveBoardChange}
          />
          <BoardDialog
            open={editing !== null}
            onOpenChange={(o) => !o && setEditing(null)}
            mode="edit"
            board={editing}
            workspaceId={workspaceId}
            currentMemberId={currentMember.id}
          />
        </>
      )}

      <AlertDialog open={deleting !== null} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {deletingCount > 0 ? "Board isn’t empty" : `Delete “${deleting?.name}”?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {deletingCount > 0
                ? `This board still has ${deletingCount} ${
                    deletingCount === 1 ? "task" : "tasks"
                  }. Move or delete ${
                    deletingCount === 1 ? "it" : "them"
                  } first, then you can remove the board.`
                : "This removes the board. Its tasks are already gone. You can undo this right after."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{deletingCount > 0 ? "Close" : "Cancel"}</AlertDialogCancel>
            {deletingCount === 0 && (
              <AlertDialogAction
                onClick={confirmDelete}
                className="bg-destructive text-white hover:bg-destructive/90"
              >
                Delete
              </AlertDialogAction>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
