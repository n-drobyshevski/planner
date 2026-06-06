"use client";

import * as React from "react";
import { Users, User, Loader2 } from "lucide-react";
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
  ResponsiveDialogDescription,
  ResponsiveDialogBody,
  ResponsiveDialogFooter,
} from "@/components/ui/responsive-dialog";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toPaletteColor } from "@/lib/theme/appearance";
import { CONTEXT_PALETTE as PALETTE } from "@/lib/contexts/palette";
import { useBoardMutations } from "@/lib/hooks/use-board-mutations";
import type { Board } from "@/lib/types";

/**
 * Create or edit a task board, presented as a centered dialog on desktop and a
 * bottom sheet on phones. Mirrors CreateContextDialog — same fields (name,
 * color, Shared/Personal) and look — so a board is managed just like a context.
 * In create mode it reports the new id via onCreated so the opener can switch to
 * it immediately.
 */
export function BoardDialog({
  open,
  onOpenChange,
  mode,
  board,
  workspaceId,
  currentMemberId,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "create" | "edit";
  /** The board being edited (edit mode only). */
  board?: Board | null;
  workspaceId: string;
  currentMemberId: string;
  /** Called with the new board id once it's created (create mode). */
  onCreated?: (boardId: string) => void;
}) {
  const mutations = useBoardMutations();
  const [name, setName] = React.useState("");
  const [color, setColor] = React.useState<string>(PALETTE[0]);
  // Default to Shared: the common case for a two-person planner.
  const [shared, setShared] = React.useState(true);
  const [pending, setPending] = React.useState(false);

  // Reset to the board's values (edit) or a clean slate (create) on (re)open.
  React.useEffect(() => {
    if (!open) return;
    if (mode === "edit" && board) {
      setName(board.name);
      setColor(board.color);
      setShared(board.ownerId === null);
    } else {
      setName("");
      setColor(PALETTE[0]);
      setShared(true);
    }
    setPending(false);
  }, [open, mode, board]);

  async function save() {
    if (!name.trim() || pending) return;

    if (mode === "edit") {
      if (!board) return;
      // Edit: apply name/color and, if the share state changed, owner too. Both
      // mutations patch the cache optimistically, so close now and let them
      // reconcile in the background (failures surface via toast + undo).
      const wantShared = shared;
      const isShared = board.ownerId === null;
      onOpenChange(false);
      if (name.trim() !== board.name || color !== board.color) {
        void mutations.update(board.id, { name: name.trim(), color });
      }
      if (wantShared !== isShared) {
        void mutations.setShared(board.id, wantShared ? null : currentMemberId);
      }
      return;
    }

    // create: await the new id so we can switch the board view to it.
    setPending(true);
    try {
      const id = await mutations.create({
        workspaceId,
        ownerId: shared ? null : currentMemberId,
        name: name.trim(),
        color,
        sortOrder: Date.now(),
      });
      if (id) {
        onCreated?.(id);
        onOpenChange(false);
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange}>
      <ResponsiveDialogContent>
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle>
            {mode === "create" ? "New board" : "Edit board"}
          </ResponsiveDialogTitle>
          <ResponsiveDialogDescription>
            A board is a collection of tasks. Keep it to yourself or share it.
          </ResponsiveDialogDescription>
        </ResponsiveDialogHeader>

        <ResponsiveDialogBody className="flex flex-col gap-4 py-3">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Board name"
            onKeyDown={(e) => e.key === "Enter" && save()}
            aria-label="Board name"
            autoFocus
          />

          <div className="flex flex-wrap gap-2">
            {PALETTE.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={`Color ${c}`}
                aria-pressed={color === c}
                onClick={() => setColor(c)}
                className={cn(
                  "size-7 rounded-full ring-offset-2 ring-offset-background transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  color === c && "ring-2 ring-foreground",
                )}
                style={{ backgroundColor: toPaletteColor(c) }}
              />
            ))}
          </div>

          <div className="flex flex-col gap-1.5">
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
                aria-label="Shared board — you both see and edit it"
              />
            </label>
            <p className="text-xs text-muted-foreground">
              {shared
                ? "You both see it and can edit its tasks."
                : "Only you can see this board and its tasks."}
            </p>
          </div>
        </ResponsiveDialogBody>

        <ResponsiveDialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={save} disabled={pending || !name.trim()}>
            {pending && <Loader2 data-icon="inline-start" className="animate-spin" />}
            {mode === "create" ? "Add board" : "Save"}
          </Button>
        </ResponsiveDialogFooter>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}
