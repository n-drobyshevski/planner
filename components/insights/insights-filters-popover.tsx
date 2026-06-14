"use client";

import { useState } from "react";
import { SlidersHorizontal } from "lucide-react";
import { useTranslations } from "next-intl";
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
  /** true on the Sleep tab, where these filters deliberately have no effect */
  filtersInert?: boolean;
}

/**
 * Insights-local filters: member, categories, include-inactive. Independent of
 * the calendar's sidebar filters by design — the member toggle doubles as the
 * cue that insights always include the partner's visible time. Popover on
 * desktop, bottom sheet on phones.
 */
export function InsightsFiltersPopover(props: FiltersProps) {
  const t = useTranslations("insights");
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);
  const activeCount =
    (props.member !== "both" ? 1 : 0) +
    props.hiddenCategoryIds.size +
    (props.includeInactive ? 1 : 0);

  const trigger = (
    <Button
      variant="outline"
      size="sm"
      aria-label={t("filters.trigger")}
      className="min-h-11 sm:min-h-7"
    >
      <SlidersHorizontal data-icon="inline-start" />
      <span className="hidden sm:inline">{t("filters.trigger")}</span>
      {activeCount > 0 && (
        <Badge
          variant={props.filtersInert ? "outline" : "secondary"}
          className="ml-0.5 px-1.5 tabular-nums"
        >
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
            <ResponsiveDialogTitle>{t("filters.title")}</ResponsiveDialogTitle>
            <ResponsiveDialogDescription>
              {t("filters.description")}
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
  filtersInert = false,
}: FiltersProps) {
  const t = useTranslations("insights");
  function toggleCategory(id: string, visible: boolean) {
    const next = new Set(hiddenCategoryIds);
    if (visible) next.delete(id);
    else next.add(id);
    onHiddenCategoryIdsChange(next);
  }

  return (
    <div className="space-y-4">
      {filtersInert && (
        <p className="rounded-md bg-muted/50 px-2 py-1.5 text-xs text-muted-foreground">
          {t("filters.inertNote")}
        </p>
      )}
      {members.length > 1 && (
        <fieldset className="space-y-1.5">
          <legend className="text-xs font-medium text-muted-foreground">
            {t("filters.whoseTime")}
          </legend>
          <ToggleGroup
            type="single"
            value={member}
            onValueChange={(v) => v && onMemberChange(v as MemberFilter)}
            variant="outline"
            size="sm"
            className="w-full"
            disabled={filtersInert}
          >
            <ToggleGroupItem value="me" className="flex-1">
              {t("filters.me")}
            </ToggleGroupItem>
            <ToggleGroupItem value="partner" className="flex-1">
              {t("filters.partner")}
            </ToggleGroupItem>
            <ToggleGroupItem value="both" className="flex-1">
              {t("filters.both")}
            </ToggleGroupItem>
          </ToggleGroup>
        </fieldset>
      )}

      {categories.length > 0 && (
        <fieldset className="space-y-1.5">
          <legend className="text-xs font-medium text-muted-foreground">
            {t("filters.categories")}
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
          {t("filters.includeInactive")}
          <span className="block text-xs text-muted-foreground">
            {t("filters.includeInactiveHint")}
          </span>
        </span>
        <Switch checked={includeInactive} onCheckedChange={onIncludeInactiveChange} />
      </Label>
    </div>
  );
}
