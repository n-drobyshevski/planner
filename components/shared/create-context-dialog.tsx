"use client";

import * as React from "react";
import { Users, User, Loader2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
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
import { createClient } from "@/lib/supabase/client";
import { createCategory } from "@/lib/supabase/mutations";
import { qk } from "@/lib/supabase/query-keys";

/**
 * Inline "create a new Context" surface, presented as a centered dialog on
 * desktop and a bottom sheet on phones (via ResponsiveDialog). Mirrors the
 * sidebar's AddCategoryPopover — same fields (name, color, Shared/Personal) and
 * same createCategory + workspace-invalidation flow — so a context created here
 * is identical to one created from the sidebar. On success it reports the new
 * id via onCreated so the opener can select it immediately.
 */
export function CreateContextDialog({
  open,
  onOpenChange,
  workspaceId,
  currentMemberId,
  defaultName,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceId: string;
  currentMemberId: string;
  /** Seed the name field (e.g. text typed before opening). */
  defaultName?: string;
  /** Called with the new category id once it's created. */
  onCreated: (categoryId: string) => void;
}) {
  const qc = useQueryClient();
  const [name, setName] = React.useState(defaultName ?? "");
  const [color, setColor] = React.useState<string>(PALETTE[0]);
  // Default to Shared: the common case for a two-person planner and what every
  // context was before Personal contexts existed.
  const [shared, setShared] = React.useState(true);
  const [pending, setPending] = React.useState(false);

  // Reset to a clean slate whenever the dialog (re)opens.
  React.useEffect(() => {
    if (open) {
      setName(defaultName ?? "");
      setColor(PALETTE[0]);
      setShared(true);
      setPending(false);
    }
  }, [open, defaultName]);

  async function add() {
    if (!name.trim() || pending) return;
    setPending(true);
    try {
      const id = await createCategory(createClient(), {
        workspaceId,
        ownerId: shared ? null : currentMemberId,
        name: name.trim(),
        color,
      });
      await qc.invalidateQueries({ queryKey: qk.workspace });
      onCreated(id);
      onOpenChange(false);
    } finally {
      setPending(false);
    }
  }

  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange}>
      <ResponsiveDialogContent>
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle>New context</ResponsiveDialogTitle>
          <ResponsiveDialogDescription>
            Group related events under a shared or personal context.
          </ResponsiveDialogDescription>
        </ResponsiveDialogHeader>

        <ResponsiveDialogBody className="flex flex-col gap-4 py-3">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Context name"
            onKeyDown={(e) => e.key === "Enter" && add()}
            aria-label="Context name"
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
                aria-label="Shared context — you both attend and can edit"
              />
            </label>
            <p className="text-xs text-muted-foreground">
              {shared
                ? "You both attend and can edit every event in it."
                : "Only on your calendar; only you can edit its events."}
            </p>
          </div>
        </ResponsiveDialogBody>

        <ResponsiveDialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={add} disabled={pending || !name.trim()}>
            {pending && <Loader2 data-icon="inline-start" className="animate-spin" />}
            Add context
          </Button>
        </ResponsiveDialogFooter>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}
