"use client";

import { useTranslations } from "next-intl";
import { SlidersHorizontal, ArrowUp, ArrowDown, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { toPaletteColor } from "@/lib/theme/appearance";
import {
  activeFilterCount,
  type FlowsDisplay,
  type FlowsFilter,
  type FlowsGroupBy,
  type FlowsSortBy,
} from "@/lib/tasks/flows-display";
import type { Board, Category } from "@/lib/types";

const GROUP_BYS: FlowsGroupBy[] = ["none", "status", "category", "priority"];
const SORT_BYS: FlowsSortBy[] = ["manual", "start", "due", "title", "priority", "created"];
const PRIORITIES = [3, 2, 1, 0] as const; // high -> none
const PRIORITY_LABEL: Record<number, string> = {
  3: "priority.high",
  2: "priority.medium",
  1: "priority.low",
  0: "priority.none",
};

export function FlowsDisplayMenu({
  display,
  onChange,
  onReset,
  boards,
  categories,
  totalCount,
  filteredCount,
}: {
  display: FlowsDisplay;
  onChange: (next: FlowsDisplay) => void;
  onReset: () => void;
  boards: Board[];
  categories: Category[];
  totalCount: number;
  filteredCount: number;
}) {
  const t = useTranslations("tasks");
  const { filter } = display;
  const activeFilters = activeFilterCount(filter);
  const setFilter = (patch: Partial<FlowsFilter>) =>
    onChange({ ...display, filter: { ...filter, ...patch } });

  // A null array means "all selected". Toggling collapses back to null once
  // every option is checked again, so the filter reads as inactive.
  const toggleBoard = (id: string) => {
    const all = boards.map((b) => b.id);
    const cur = filter.boardIds ?? all;
    const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
    setFilter({ boardIds: next.length === all.length ? null : next });
  };
  const toggleCategory = (value: string | null) => {
    const all: (string | null)[] = [...categories.map((c) => c.id), null];
    const cur = filter.categoryIds ?? all;
    const next = cur.includes(value) ? cur.filter((x) => x !== value) : [...cur, value];
    setFilter({ categoryIds: next.length === all.length ? null : next });
  };
  const togglePriority = (value: number) => {
    const all = [...PRIORITIES];
    const cur = filter.priorities ?? all;
    const next = cur.includes(value) ? cur.filter((x) => x !== value) : [...cur, value];
    setFilter({ priorities: next.length === all.length ? null : next });
  };

  const boardChecked = (id: string) => filter.boardIds === null || filter.boardIds.includes(id);
  const categoryChecked = (value: string | null) =>
    filter.categoryIds === null || filter.categoryIds.includes(value);
  const priorityChecked = (value: number) =>
    filter.priorities === null || filter.priorities.includes(value);

  const reorderable = display.sortBy === "manual";

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative"
          aria-label={
            activeFilters > 0
              ? t("flows.display.labelActive", { count: activeFilters })
              : t("flows.display.label")
          }
        >
          <SlidersHorizontal />
          {activeFilters > 0 && (
            <span
              aria-hidden
              className="absolute -top-0.5 -right-0.5 grid size-4 place-items-center rounded-full bg-primary text-[10px] font-medium tabular-nums text-primary-foreground"
            >
              {activeFilters}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="max-h-[min(34rem,calc(100dvh-5rem))] w-72 gap-0 overflow-y-auto p-0"
      >
        {/* Filter */}
        <Section title={t("flows.display.filter")}>
          <Subhead>{t("flows.display.status")}</Subhead>
          <div className="flex flex-col">
            {boards.map((b) => (
              <CheckRow
                key={b.id}
                checked={boardChecked(b.id)}
                onToggle={() => toggleBoard(b.id)}
                label={b.name}
              />
            ))}
          </div>

          {categories.length > 0 && (
            <>
              <Subhead>{t("flows.display.category")}</Subhead>
              <div className="flex flex-col">
                {categories.map((c) => (
                  <CheckRow
                    key={c.id}
                    checked={categoryChecked(c.id)}
                    onToggle={() => toggleCategory(c.id)}
                    label={c.name}
                    swatch={c.color}
                  />
                ))}
                <CheckRow
                  checked={categoryChecked(null)}
                  onToggle={() => toggleCategory(null)}
                  label={t("flows.display.noCategory")}
                />
              </div>
            </>
          )}

          <Subhead>{t("flows.filter.priority")}</Subhead>
          <div className="flex flex-col">
            {PRIORITIES.map((p) => (
              <CheckRow
                key={p}
                checked={priorityChecked(p)}
                onToggle={() => togglePriority(p)}
                label={t(PRIORITY_LABEL[p])}
              />
            ))}
          </div>

          <Subhead>{t("flows.filter.state")}</Subhead>
          <TriToggle
            value={filter.done}
            onValueChange={(v) => setFilter({ done: v as FlowsFilter["done"] })}
            options={[
              ["all", t("flows.filter.all")],
              ["open", t("flows.filter.open")],
              ["done", t("flows.filter.doneState")],
            ]}
            ariaLabel={t("flows.filter.state")}
          />

          <Subhead>{t("flows.filter.milestone")}</Subhead>
          <TriToggle
            value={filter.milestone}
            onValueChange={(v) => setFilter({ milestone: v as FlowsFilter["milestone"] })}
            options={[
              ["all", t("flows.filter.all")],
              ["only", t("flows.filter.milestoneOnly")],
              ["exclude", t("flows.filter.milestoneExclude")],
            ]}
            ariaLabel={t("flows.filter.milestone")}
          />

          <Subhead>{t("flows.filter.privacy")}</Subhead>
          <TriToggle
            value={filter.privacy}
            onValueChange={(v) => setFilter({ privacy: v as FlowsFilter["privacy"] })}
            options={[
              ["all", t("flows.filter.all")],
              ["private", t("flows.filter.private")],
              ["shared", t("flows.filter.shared")],
            ]}
            ariaLabel={t("flows.filter.privacy")}
          />
        </Section>

        {/* Group by */}
        <Section title={t("flows.display.group")} bordered>
          <RadioGroup
            value={display.groupBy}
            onValueChange={(v) => onChange({ ...display, groupBy: v as FlowsGroupBy })}
            className="gap-0"
          >
            {GROUP_BYS.map((g) => (
              <RadioRow key={g} value={g} label={t(`flows.display.${g}`)} />
            ))}
          </RadioGroup>
        </Section>

        {/* Sort by */}
        <Section title={t("flows.display.sort")} bordered>
          <div className="mb-2 flex items-center justify-between">
            <span className="sr-only">{t("flows.display.sort")}</span>
            <Button
              variant="outline"
              size="sm"
              className="ml-auto h-7 gap-1.5 px-2 text-xs"
              disabled={display.sortBy === "manual"}
              onClick={() =>
                onChange({ ...display, sortDir: display.sortDir === "asc" ? "desc" : "asc" })
              }
              aria-label={t("flows.display.direction")}
            >
              {display.sortDir === "asc" ? (
                <ArrowUp className="size-3.5" />
              ) : (
                <ArrowDown className="size-3.5" />
              )}
              {t(`flows.display.${display.sortDir}`)}
            </Button>
          </div>
          <RadioGroup
            value={display.sortBy}
            onValueChange={(v) => onChange({ ...display, sortBy: v as FlowsSortBy })}
            className="gap-0"
          >
            {SORT_BYS.map((s) => (
              <RadioRow key={s} value={s} label={t(`flows.sort.${s}`)} />
            ))}
          </RadioGroup>
          {!reorderable && (
            <p className="mt-2 text-xs leading-snug text-muted-foreground">
              {t("flows.dnd.disabledHint")}
            </p>
          )}
        </Section>

        {/* Footer */}
        <div className="flex items-center justify-between gap-2 border-t border-border px-4 py-3">
          <span className="text-xs text-muted-foreground tabular-nums">
            {t("flows.display.count", { shown: filteredCount, total: totalCount })}
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1.5 px-2 text-xs"
            onClick={onReset}
            disabled={activeFilters === 0 && display.groupBy === "none" && display.sortBy === "manual"}
          >
            <RotateCcw className="size-3.5" />
            {t("flows.display.reset")}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function Section({
  title,
  bordered,
  children,
}: {
  title: string;
  bordered?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className={cn("px-4 py-3", bordered && "border-t border-border")}>
      <h3 className="mb-2 text-xs font-medium tracking-wide text-foreground">{title}</h3>
      {children}
    </section>
  );
}

function Subhead({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-2.5 mb-1 text-[11px] font-medium tracking-wide text-muted-foreground uppercase first:mt-0">
      {children}
    </p>
  );
}

function CheckRow({
  checked,
  onToggle,
  label,
  swatch,
}: {
  checked: boolean;
  onToggle: () => void;
  label: string;
  swatch?: string;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2.5 rounded-md py-1.5 pr-1 text-sm hover:bg-muted/60">
      <Checkbox checked={checked} onCheckedChange={onToggle} />
      {swatch && (
        <span
          aria-hidden
          className="size-2.5 shrink-0 rounded-full"
          style={{ backgroundColor: toPaletteColor(swatch) }}
        />
      )}
      <span className="min-w-0 flex-1 truncate">{label}</span>
    </label>
  );
}

function RadioRow({ value, label }: { value: string; label: string }) {
  return (
    <label className="flex cursor-pointer items-center gap-2.5 rounded-md py-1.5 pr-1 text-sm hover:bg-muted/60">
      <RadioGroupItem value={value} />
      <span className="min-w-0 flex-1 truncate">{label}</span>
    </label>
  );
}

function TriToggle({
  value,
  onValueChange,
  options,
  ariaLabel,
}: {
  value: string;
  onValueChange: (v: string) => void;
  options: [string, string][];
  ariaLabel: string;
}) {
  return (
    <ToggleGroup
      type="single"
      value={value}
      onValueChange={(v) => v && onValueChange(v)}
      variant="segmented"
      size="sm"
      aria-label={ariaLabel}
      className="w-full"
    >
      {options.map(([v, label]) => (
        <ToggleGroupItem key={v} value={v} className="flex-1 text-xs">
          {label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
