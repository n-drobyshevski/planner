"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  SlidersHorizontal,
  ArrowUp,
  ArrowDown,
  RotateCcw,
  Pencil,
  Plus,
  X,
  Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
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
  DEFAULT_FLOWS_DISPLAY,
  activeFilterCount,
  type FlowsDisplay,
  type FlowsFilter,
  type FlowsGroupBy,
  type FlowsLaneStyle,
  type FlowsMode,
  type FlowsScope,
  type FlowsSortBy,
} from "@/lib/tasks/flows-display";
import { ATTENTION_MODES, type AttentionMode } from "@/lib/tasks/attention";
import { TASK_STREAM_NAME_MAX, taskStreamNameSchema } from "@/lib/tasks/schemas";
import type { Board, Category, Collection, Member, TaskStream } from "@/lib/types";

const GROUP_BYS: FlowsGroupBy[] = [
  "none",
  "status",
  "category",
  "priority",
  "tag",
  "collection",
  "assignee",
];
const SORT_BYS: FlowsSortBy[] = [
  "manual",
  "attention",
  "start",
  "due",
  "title",
  "priority",
  "created",
];
const PRIORITIES = [3, 2, 1, 0] as const; // high -> none
const PRIORITY_LABEL: Record<number, string> = {
  3: "priority.high",
  2: "priority.medium",
  1: "priority.low",
  0: "priority.none",
};

/** The viewer's saved streams (member-private) and their writes, supplied by the shell. */
export interface SavedStreamsApi {
  streams: TaskStream[];
  onSave: (name: string, definition: FlowsDisplay) => Promise<unknown>;
  onRename: (id: string, name: string) => Promise<unknown>;
  onDelete: (id: string) => Promise<unknown>;
}

/** Two displays are the same view (a saved stream reads as "applied"). */
const sameDisplay = (a: FlowsDisplay, b: FlowsDisplay) => JSON.stringify(a) === JSON.stringify(b);

/** Toggle one value of a nullable-array filter, collapsing back to null (= all) when full. */
function toggleIn<T>(cur: T[] | null, all: T[], value: T): T[] | null {
  const base = cur ?? all;
  const next = base.includes(value) ? base.filter((x) => x !== value) : [...base, value];
  return next.length === all.length && all.every((v) => next.includes(v)) ? null : next;
}

export function FlowsDisplayMenu({
  display,
  onChange,
  onReset,
  boards,
  categories,
  collections,
  members,
  tags,
  totalCount,
  filteredCount,
  savedStreams,
}: {
  display: FlowsDisplay;
  onChange: (next: FlowsDisplay) => void;
  onReset: () => void;
  boards: Board[];
  categories: Category[];
  /** the collections the viewer can see (for the scope hint) */
  collections: Collection[];
  members: Member[];
  /** tags in use on the tasks in scope, most used first */
  tags: string[];
  totalCount: number;
  filteredCount: number;
  savedStreams?: SavedStreamsApi;
}) {
  const t = useTranslations("tasks");
  const { filter } = display;
  const activeFilters = activeFilterCount(filter);
  const setFilter = (patch: Partial<FlowsFilter>) =>
    onChange({ ...display, filter: { ...filter, ...patch } });

  // A null array means "all selected". Toggling collapses back to null once
  // every option is checked again, so the filter reads as inactive.
  const toggleBoard = (id: string) =>
    setFilter({ boardIds: toggleIn(filter.boardIds, boards.map((b) => b.id), id) });
  const toggleCategory = (value: string | null) =>
    setFilter({
      categoryIds: toggleIn<string | null>(
        filter.categoryIds,
        [...categories.map((c) => c.id), null],
        value,
      ),
    });
  const togglePriority = (value: number) =>
    setFilter({ priorities: toggleIn<number>(filter.priorities, [...PRIORITIES], value) });
  const toggleTag = (value: string | null) =>
    setFilter({ tags: toggleIn<string | null>(filter.tags, [...tags, null], value) });
  const toggleAssignee = (value: string | null) =>
    setFilter({
      assigneeIds: toggleIn<string | null>(
        filter.assigneeIds,
        [...members.map((m) => m.id), null],
        value,
      ),
    });

  const checkedIn = <T,>(arr: T[] | null, v: T) => arr === null || arr.includes(v);

  const reorderable = display.sortBy === "manual";
  const isDefault = sameDisplay(display, DEFAULT_FLOWS_DISPLAY);

  // Sorting by attention reads most-pressing-first, which is "desc" in the
  // pipeline; switching to it starts there rather than at the calm end.
  const setSort = (sortBy: FlowsSortBy) =>
    onChange({
      ...display,
      sortBy,
      sortDir: sortBy === "attention" ? "desc" : display.sortDir,
    });

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
        className="max-h-[min(40rem,calc(100dvh-5rem))] w-80 gap-0 overflow-y-auto p-0"
      >
        {/* View: one lane per task, or one per group; which collections feed it */}
        <Section title={t("flows.display.view")}>
          <TriToggle
            value={display.mode}
            onValueChange={(v) => onChange({ ...display, mode: v as FlowsMode })}
            options={[
              ["tasks", t("flows.display.modeTasks")],
              ["streams", t("flows.display.modeStreams")],
            ]}
            ariaLabel={t("flows.display.mode")}
          />
          <p className="mt-1.5 text-xs leading-snug text-muted-foreground">
            {t(display.mode === "streams" ? "flows.display.modeStreamsHint" : "flows.display.modeTasksHint")}
          </p>
          <Subhead>{t("flows.display.laneStyle")}</Subhead>
          <TriToggle
            value={display.laneStyle}
            onValueChange={(v) => onChange({ ...display, laneStyle: v as FlowsLaneStyle })}
            options={[
              ["runway", t("flows.display.laneStyleRunway")],
              ["line", t("flows.display.laneStyleLine")],
            ]}
            ariaLabel={t("flows.display.laneStyle")}
          />
          <p className="mt-1.5 text-xs leading-snug text-muted-foreground">
            {t(
              display.laneStyle === "runway"
                ? "flows.display.laneStyleRunwayHint"
                : "flows.display.laneStyleLineHint",
            )}
          </p>
          {collections.length > 1 && (
            <>
              <Subhead>{t("flows.display.scope")}</Subhead>
              <TriToggle
                value={display.scope}
                onValueChange={(v) => onChange({ ...display, scope: v as FlowsScope })}
                options={[
                  ["collection", t("flows.display.scopeCollection")],
                  ["all", t("flows.display.scopeAll")],
                ]}
                ariaLabel={t("flows.display.scope")}
              />
            </>
          )}
        </Section>

        {/* Filter */}
        <Section title={t("flows.display.filter")} bordered>
          <Subhead>{t("flows.filter.status")}</Subhead>
          <div className="flex flex-col">
            {boards.map((b) => (
              <CheckRow
                key={b.id}
                checked={checkedIn(filter.boardIds, b.id)}
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
                    checked={checkedIn(filter.categoryIds, c.id)}
                    onToggle={() => toggleCategory(c.id)}
                    label={c.name}
                    swatch={c.color}
                  />
                ))}
                <CheckRow
                  checked={checkedIn(filter.categoryIds, null)}
                  onToggle={() => toggleCategory(null)}
                  label={t("flows.display.noCategory")}
                />
              </div>
            </>
          )}

          {tags.length > 0 && (
            <>
              <Subhead>{t("flows.filter.tags")}</Subhead>
              <div className="flex flex-col">
                {tags.map((tag) => (
                  <CheckRow
                    key={tag}
                    checked={checkedIn(filter.tags, tag)}
                    onToggle={() => toggleTag(tag)}
                    label={`#${tag}`}
                  />
                ))}
                <CheckRow
                  checked={checkedIn(filter.tags, null)}
                  onToggle={() => toggleTag(null)}
                  label={t("flows.display.noTag")}
                />
              </div>
            </>
          )}

          {members.length > 0 && (
            <>
              <Subhead>{t("flows.filter.assignee")}</Subhead>
              <div className="flex flex-col">
                {members.map((m) => (
                  <CheckRow
                    key={m.id}
                    checked={checkedIn(filter.assigneeIds, m.id)}
                    onToggle={() => toggleAssignee(m.id)}
                    label={m.name}
                    swatch={m.color}
                  />
                ))}
                <CheckRow
                  checked={checkedIn(filter.assigneeIds, null)}
                  onToggle={() => toggleAssignee(null)}
                  label={t("flows.display.unassigned")}
                />
              </div>
            </>
          )}

          <Subhead>{t("flows.filter.priority")}</Subhead>
          <div className="flex flex-col">
            {PRIORITIES.map((p) => (
              <CheckRow
                key={p}
                checked={checkedIn(filter.priorities, p)}
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
            aria-label={t("flows.display.group")}
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
              {display.sortBy === "attention"
                ? t(`flows.display.attention${display.sortDir === "desc" ? "Desc" : "Asc"}`)
                : t(`flows.display.${display.sortDir}`)}
            </Button>
          </div>
          <RadioGroup
            value={display.sortBy}
            onValueChange={(v) => setSort(v as FlowsSortBy)}
            className="gap-0"
            aria-label={t("flows.display.sort")}
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

          <Subhead>{t("flows.display.attention")}</Subhead>
          <TriToggle
            value={display.attention}
            onValueChange={(v) => onChange({ ...display, attention: v as AttentionMode })}
            options={ATTENTION_MODES.map((m) => [m, t(`flows.display.attentionMode.${m}`)])}
            ariaLabel={t("flows.display.attention")}
          />
          <p className="mt-1.5 text-xs leading-snug text-muted-foreground">
            {t(`flows.display.attentionHint.${display.attention}`)}
          </p>
        </Section>

        {savedStreams && (
          <SavedStreamsSection api={savedStreams} display={display} onApply={onChange} />
        )}

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
            disabled={isDefault}
          >
            <RotateCcw className="size-3.5" />
            {t("flows.display.reset")}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

type NameError = "required" | "tooLong" | "taken" | "failed";

/** Validate a stream name against the schema and the viewer's other names (case-insensitive). */
export function streamNameError(
  name: string,
  streams: TaskStream[],
  exceptId?: string,
): NameError | null {
  const parsed = taskStreamNameSchema.safeParse(name);
  if (!parsed.success) {
    return parsed.error.issues[0]?.code === "too_big" ? "tooLong" : "required";
  }
  const lower = parsed.data.toLowerCase();
  if (streams.some((s) => s.id !== exceptId && s.name.trim().toLowerCase() === lower)) {
    return "taken";
  }
  return null;
}

/**
 * Saved streams: a named Flows display (mode, grouping, filters, sort, scope).
 * Member-private, like Insights' saved views: applying one sets the whole
 * display; rename and delete act on the row in place.
 */
function SavedStreamsSection({
  api,
  display,
  onApply,
}: {
  api: SavedStreamsApi;
  display: FlowsDisplay;
  onApply: (next: FlowsDisplay) => void;
}) {
  const t = useTranslations("tasks");
  const tc = useTranslations("common");
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState<NameError | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [renameError, setRenameError] = useState<NameError | null>(null);

  const errorText = (e: NameError) =>
    e === "tooLong"
      ? t("flows.saved.nameTooLong", { max: TASK_STREAM_NAME_MAX })
      : t(`flows.saved.${e === "required" ? "nameRequired" : e === "taken" ? "nameTaken" : "saveFailed"}`);

  async function save() {
    const e = streamNameError(name, api.streams);
    setError(e);
    if (e) return;
    try {
      await api.onSave(name.trim(), display);
      setName("");
      setAdding(false);
    } catch (err) {
      // The unique index is the last word on duplicates (a stream saved on
      // another device since this list loaded).
      setError(err instanceof Error && /already/i.test(err.message) ? "taken" : "failed");
    }
  }

  async function rename(id: string) {
    const e = streamNameError(renameValue, api.streams, id);
    setRenameError(e);
    if (e) return;
    try {
      await api.onRename(id, renameValue.trim());
      setRenaming(null);
    } catch (err) {
      setRenameError(err instanceof Error && /already/i.test(err.message) ? "taken" : "failed");
    }
  }

  return (
    <Section title={t("flows.saved.title")} bordered>
      {api.streams.length === 0 ? (
        <p className="mb-2 text-xs leading-snug text-muted-foreground">{t("flows.saved.empty")}</p>
      ) : (
        <>
          <ul className="mb-2 flex flex-col" aria-label={t("flows.saved.title")}>
            {api.streams.map((s) => {
              const applied = sameDisplay(s.definition, display);
              if (renaming === s.id) {
                return (
                  <li key={s.id} className="py-1">
                    <div className="flex items-center gap-1">
                      <Input
                        autoFocus
                        value={renameValue}
                        onChange={(e) => {
                          setRenameValue(e.target.value);
                          setRenameError(null);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                            e.preventDefault();
                            void rename(s.id);
                          } else if (e.key === "Escape") {
                            e.preventDefault();
                            e.stopPropagation();
                            setRenaming(null);
                          }
                        }}
                        maxLength={TASK_STREAM_NAME_MAX + 10}
                        aria-label={t("flows.saved.renameLabel", { name: s.name })}
                        aria-invalid={renameError ? true : undefined}
                        aria-describedby={renameError ? `stream-rename-error-${s.id}` : undefined}
                        className="h-8 flex-1 text-sm"
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8 shrink-0"
                        aria-label={t("flows.saved.renameAction")}
                        onClick={() => void rename(s.id)}
                      >
                        <Check />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8 shrink-0 text-muted-foreground"
                        aria-label={tc("cancel")}
                        onClick={() => setRenaming(null)}
                      >
                        <X />
                      </Button>
                    </div>
                    {renameError && (
                      <p
                        id={`stream-rename-error-${s.id}`}
                        role="alert"
                        className="mt-1 text-xs text-destructive"
                      >
                        {errorText(renameError)}
                      </p>
                    )}
                  </li>
                );
              }
              return (
                <li key={s.id} className="flex items-center gap-0.5">
                  <Button
                    variant="ghost"
                    size="sm"
                    className={cn(
                      "h-8 min-w-0 flex-1 justify-start gap-2 px-2 text-sm font-normal",
                      applied && "font-medium",
                    )}
                    aria-pressed={applied}
                    onClick={() => onApply(s.definition)}
                  >
                    <span className="min-w-0 truncate">{s.name}</span>
                    {applied && (
                      <Check className="ml-auto size-3.5 shrink-0" aria-hidden />
                    )}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8 shrink-0 text-muted-foreground"
                    aria-label={t("flows.saved.rename", { name: s.name })}
                    onClick={() => {
                      setRenaming(s.id);
                      setRenameValue(s.name);
                      setRenameError(null);
                    }}
                  >
                    <Pencil />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8 shrink-0 text-muted-foreground"
                    aria-label={t("flows.saved.delete", { name: s.name })}
                    onClick={() => void api.onDelete(s.id).catch(() => {})}
                  >
                    <X />
                  </Button>
                </li>
              );
            })}
          </ul>
          <p className="mb-2 text-xs leading-snug text-muted-foreground">{t("flows.saved.private")}</p>
        </>
      )}

      {adding ? (
        <div>
          <div className="flex items-center gap-1.5">
            <Input
              autoFocus
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  void save();
                } else if (e.key === "Escape") {
                  e.preventDefault();
                  e.stopPropagation();
                  setAdding(false);
                }
              }}
              maxLength={TASK_STREAM_NAME_MAX + 10}
              placeholder={t("flows.saved.namePlaceholder")}
              aria-label={t("flows.saved.nameLabel")}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? "stream-name-error" : undefined}
              className="h-8 flex-1 text-sm"
            />
            <Button variant="outline" size="sm" className="h-8" onClick={() => void save()}>
              {tc("save")}
            </Button>
          </div>
          {error && (
            <p id="stream-name-error" role="alert" className="mt-1 text-xs text-destructive">
              {errorText(error)}
            </p>
          )}
        </div>
      ) : (
        <Button
          variant="outline"
          size="sm"
          className="h-8 w-full justify-start gap-1.5 text-xs"
          onClick={() => {
            setAdding(true);
            setError(null);
          }}
        >
          <Plus className="size-3.5" />
          {t("flows.saved.save")}
        </Button>
      )}
    </Section>
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
