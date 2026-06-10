"use client";

import { useState } from "react";
import { SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  ResponsiveDialog,
  ResponsiveDialogBody,
  ResponsiveDialogContent,
  ResponsiveDialogDescription,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
  ResponsiveDialogTrigger,
} from "@/components/ui/responsive-dialog";
import { useIsMobile } from "@/hooks/use-mobile";
import type { MemberFilter } from "@/lib/insights/filters";
import type { Category, Member } from "@/lib/types";

interface FiltersProps {
  members: Member[];
  categories: Category[];
  member: MemberFilter;
  onMemberChange: (m: MemberFilter) => void;
  hiddenCategoryIds: Set<string>;
  onHiddenCategoryIdsChange: (ids: Set<string>) => void;
  includeInactive: boolean;
  onIncludeInactiveChange: (v: boolean) => void;
}

/**
 * Insights-local filters: member, categories, include-inactive. Independent of
 * the calendar's sidebar filters by design — the member toggle doubles as the
 * cue that insights always include the partner's visible time. Popover on
 * desktop, bottom sheet on phones.
 */
export function InsightsFiltersPopover(props: FiltersProps) {
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);
  const activeCount =
    (props.member !== "both" ? 1 : 0) +
    props.hiddenCategoryIds.size +
    (props.includeInactive ? 1 : 0);

  const trigger = (
    <Button variant="outline" size="sm" aria-label="Filters">
      <SlidersHorizontal data-icon="inline-start" />
      <span className="hidden sm:inline">Filters</span>
      {activeCount > 0 && (
        <Badge variant="secondary" className="ml-0.5 px-1.5 tabular-nums">
          {activeCount}
        </Badge>
      )}
    </Button>
  );

  if (isMobile) {
    return (
      <ResponsiveDialog open={open} onOpenChange={setOpen}>
        <ResponsiveDialogTrigger asChild>{trigger}</ResponsiveDialogTrigger>
        <ResponsiveDialogContent>
          <ResponsiveDialogHeader>
            <ResponsiveDialogTitle>Filters</ResponsiveDialogTitle>
            <ResponsiveDialogDescription>
              What counts toward these numbers.
            </ResponsiveDialogDescription>
          </ResponsiveDialogHeader>
          <ResponsiveDialogBody className="pb-safe space-y-4 pt-1 pb-4">
            <FiltersForm {...props} />
          </ResponsiveDialogBody>
        </ResponsiveDialogContent>
      </ResponsiveDialog>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent align="end" className="w-72 space-y-4">
        <FiltersForm {...props} />
      </PopoverContent>
    </Popover>
  );
}

function FiltersForm({
  members,
  categories,
  member,
  onMemberChange,
  hiddenCategoryIds,
  onHiddenCategoryIdsChange,
  includeInactive,
  onIncludeInactiveChange,
}: FiltersProps) {
  function toggleCategory(id: string, visible: boolean) {
    const next = new Set(hiddenCategoryIds);
    if (visible) next.delete(id);
    else next.add(id);
    onHiddenCategoryIdsChange(next);
  }

  return (
    <div className="space-y-4">
      {members.length > 1 && (
        <fieldset className="space-y-1.5">
          <legend className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Whose time
          </legend>
          <ToggleGroup
            type="single"
            value={member}
            onValueChange={(v) => v && onMemberChange(v as MemberFilter)}
            variant="outline"
            size="sm"
            className="w-full"
          >
            <ToggleGroupItem value="me" className="flex-1">
              Me
            </ToggleGroupItem>
            <ToggleGroupItem value="partner" className="flex-1">
              Partner
            </ToggleGroupItem>
            <ToggleGroupItem value="both" className="flex-1">
              Both
            </ToggleGroupItem>
          </ToggleGroup>
        </fieldset>
      )}

      {categories.length > 0 && (
        <fieldset className="space-y-1.5">
          <legend className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Categories
          </legend>
          <div className="max-h-48 space-y-1 overflow-y-auto pr-1">
            {categories.map((c) => (
              <Label
                key={c.id}
                className="flex min-h-8 items-center gap-2 rounded-md px-1 font-normal hover:bg-accent/50"
              >
                <Checkbox
                  checked={!hiddenCategoryIds.has(c.id)}
                  onCheckedChange={(v) => toggleCategory(c.id, v === true)}
                />
                <span
                  aria-hidden
                  className="size-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: c.color ?? "var(--muted-foreground)" }}
                />
                <span className="truncate">{c.name}</span>
              </Label>
            ))}
          </div>
        </fieldset>
      )}

      <Label className="flex items-center justify-between gap-3 font-normal">
        <span>
          Include inactive blocks
          <span className="block text-xs text-muted-foreground">
            Count grayed-out time such as sleep
          </span>
        </span>
        <Switch checked={includeInactive} onCheckedChange={onIncludeInactiveChange} />
      </Label>
    </div>
  );
}
