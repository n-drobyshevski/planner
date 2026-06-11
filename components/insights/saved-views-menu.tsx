"use client";

import { useState } from "react";
import { Bookmark, Plus, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  useCreateInsightsView,
  useDeleteInsightsView,
  useInsightsViews,
} from "@/lib/hooks/use-insights-views";
import { parseViewConfig, type SavedViewConfig } from "@/lib/insights/views";

const MAX_NAME = 60; // mirrors the DB CHECK

/**
 * Saved views: named period+filter slices, member-private and synced across
 * the member's devices. Applying one routes through the shell's existing
 * period/filter setters — no new state paths. A view whose stored config has
 * become unreadable (older client wrote it, category gone…) still lists, but
 * applying it is disabled with a hint instead of silently mis-rendering.
 */
export function SavedViewsMenu({
  workspaceId,
  memberId,
  current,
  onApply,
}: {
  workspaceId: string;
  memberId: string;
  /** the slice on screen right now, for "Save current view" */
  current: SavedViewConfig;
  onApply: (config: SavedViewConfig) => void;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const { views } = useInsightsViews(workspaceId, memberId);
  const create = useCreateInsightsView(workspaceId, memberId);
  const remove = useDeleteInsightsView(workspaceId, memberId);

  function saveCurrent() {
    const trimmed = name.trim();
    if (trimmed === "") return;
    void create(trimmed.slice(0, MAX_NAME), current).catch(() => {});
    setName("");
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Saved views"
          className="size-11 sm:size-8"
        >
          <Bookmark />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 space-y-3 p-3">
        <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
          Saved views
        </p>
        {views.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            Save the period and filters you keep coming back to — &ldquo;Weekly
            retro&rdquo;, &ldquo;My deep work&rdquo;… Views are yours alone and
            follow you across devices.
          </p>
        ) : (
          <ul className="space-y-0.5" role="list">
            {views.map((v) => {
              const config = parseViewConfig(v.config);
              return (
                <li key={v.id} className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="min-h-11 min-w-0 flex-1 justify-start px-2 text-xs font-normal sm:min-h-8"
                    disabled={config === null}
                    title={
                      config === null
                        ? "This view was saved by a newer version and can't be applied here."
                        : undefined
                    }
                    onClick={() => {
                      if (config === null) return;
                      onApply(config);
                      setOpen(false);
                    }}
                  >
                    <span className="truncate">{v.name}</span>
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-11 shrink-0 text-muted-foreground sm:size-8"
                    aria-label={`Delete the saved view ${v.name}`}
                    onClick={() => void remove(v.id).catch(() => {})}
                  >
                    <X />
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
        <div className="flex items-center gap-2 border-t pt-3">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") saveCurrent();
            }}
            maxLength={MAX_NAME}
            placeholder="Name the current view…"
            aria-label="Name for the current view"
            className="h-9 flex-1 text-xs"
          />
          <Button
            variant="outline"
            size="sm"
            disabled={name.trim() === ""}
            onClick={saveCurrent}
          >
            <Plus data-icon="inline-start" />
            Save
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
