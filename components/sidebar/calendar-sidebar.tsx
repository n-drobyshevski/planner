"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { createCategory } from "@/lib/supabase/mutations";
import { qk } from "@/lib/supabase/query-keys";
import { useUiStore } from "@/stores/ui-store";
import { cn } from "@/lib/utils";
import type { Member, Category } from "@/lib/types";

const SHARED_COLOR = "#b45309";
const PALETTE = ["#c0492a", "#0f766e", "#b45309", "#15803d", "#0369a1", "#be185d", "#7c3aed"];

interface FiltersProps {
  workspaceId: string;
  members: Member[];
  categories: Category[];
}

function ToggleRow({
  color,
  label,
  active,
  onToggle,
}: {
  color: string;
  label: string;
  active: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={active}
      className="flex min-h-11 w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-sm hover:bg-sidebar-accent md:min-h-0"
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
  );
}

/**
 * Layer + category filter controls, shared by the desktop sidebar and the
 * mobile bottom sheet so the two presentations never drift apart.
 */
export function CalendarFiltersContent({ workspaceId, members, categories }: FiltersProps) {
  const hiddenLayers = useUiStore((s) => s.hiddenLayers);
  const hiddenCategoryIds = useUiStore((s) => s.hiddenCategoryIds);
  const toggleLayer = useUiStore((s) => s.toggleLayer);
  const toggleCategory = useUiStore((s) => s.toggleCategory);

  return (
    <>
      <section className="flex flex-col gap-0.5">
        <h3 className="px-2 pb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Calendars
        </h3>
        <ToggleRow
          color={SHARED_COLOR}
          label="Shared"
          active={!hiddenLayers.has("shared")}
          onToggle={() => toggleLayer("shared")}
        />
        {members.map((m) => (
          <ToggleRow
            key={m.id}
            color={m.color}
            label={m.name}
            active={!hiddenLayers.has(m.id)}
            onToggle={() => toggleLayer(m.id)}
          />
        ))}
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
            <ToggleRow
              key={c.id}
              color={c.color}
              label={c.name}
              active={!hiddenCategoryIds.has(c.id)}
              onToggle={() => toggleCategory(c.id)}
            />
          ))
        )}
      </section>
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

function AddCategoryPopover({ workspaceId }: { workspaceId: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [color, setColor] = useState(PALETTE[0]);
  const [pending, setPending] = useState(false);

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
