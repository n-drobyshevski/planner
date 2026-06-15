"use client";

import { useState } from "react";
import { MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { BoardEditorDialog } from "./board-editor-dialog";
import { useBoardMutations } from "@/lib/hooks/use-board-mutations";
import type { Board } from "@/lib/types";

/** Per-column controls: edit (name/line style/done) and delete. */
export function BoardColumnMenu({
  board,
  workspaceId,
}: {
  board: Board;
  workspaceId: string;
}) {
  const t = useTranslations("tasks");
  const mutations = useBoardMutations();
  const [editing, setEditing] = useState(false);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            aria-label={t("boardEditor.columnMenu", { name: board.name })}
          >
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          <DropdownMenuItem onSelect={() => setEditing(true)}>
            <Pencil data-icon="inline-start" />
            {t("boardEditor.editColumn")}
          </DropdownMenuItem>
          <DropdownMenuItem
            className="text-destructive"
            onSelect={() => void mutations.remove(board.id)}
          >
            <Trash2 data-icon="inline-start" />
            {t("boardEditor.deleteColumn")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <BoardEditorDialog
        open={editing}
        onOpenChange={setEditing}
        mode="edit"
        board={board}
        workspaceId={workspaceId}
        collectionId={board.collectionId}
      />
    </>
  );
}
