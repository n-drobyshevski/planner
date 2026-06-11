"use client";

import { useState } from "react";
import { Plus, Target, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  ResponsiveDialog,
  ResponsiveDialogBody,
  ResponsiveDialogContent,
  ResponsiveDialogDescription,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
} from "@/components/ui/responsive-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  useCategoryGoals,
  useDeleteCategoryGoal,
  useUpsertCategoryGoal,
} from "@/lib/hooks/use-category-goals";
import type { Category, CategoryGoal } from "@/lib/types";
import { seriesMeta } from "../series";

const HOUR = 3_600_000;
/** DB CHECK bounds, in hours (15 min .. 7 days per week). */
const MIN_HOURS = 0.25;
const MAX_HOURS = 168;

function toHoursLabel(ms: number): string {
  const h = ms / HOUR;
  return Number.isInteger(h) ? String(h) : h.toFixed(2).replace(/\.?0+$/, "");
}

function clampHours(value: number): number {
  return Math.min(MAX_HOURS, Math.max(MIN_HOURS, value));
}

/**
 * Workspace goal editor: one row per category that has a goal (hours-per-week
 * input + target/budget direction + remove), plus an add-row for categories
 * without one. Edits write through immediately (the goals hook is optimistic),
 * so there is no separate save step — closing the dialog loses nothing.
 * Goals are workspace-shared: both members see and edit the same set.
 */
export function ManageGoalsDialog({
  workspaceId,
  viewerId,
  categories,
}: {
  workspaceId: string;
  viewerId: string;
  categories: Map<string, Category>;
}) {
  const [open, setOpen] = useState(false);
  // Same query key the goals section uses — one fetch feeds both.
  const { goals } = useCategoryGoals(workspaceId);
  const upsert = useUpsertCategoryGoal(workspaceId, viewerId);
  const remove = useDeleteCategoryGoal(workspaceId);

  const withGoal = new Set(goals.map((g) => g.categoryId));
  const addable = [...categories.values()].filter((c) => !withGoal.has(c.id));

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        className="min-h-11 px-1.5 text-xs sm:min-h-7"
        onClick={() => setOpen(true)}
      >
        <Target data-icon="inline-start" />
        Manage goals
      </Button>
      <ResponsiveDialog open={open} onOpenChange={setOpen}>
        <ResponsiveDialogContent>
          <ResponsiveDialogHeader>
            <ResponsiveDialogTitle>Weekly time goals</ResponsiveDialogTitle>
            <ResponsiveDialogDescription>
              Hours per week per context — a target to reach, or a budget to
              stay under. Goals are shared: you and your partner plan against
              the same numbers.
            </ResponsiveDialogDescription>
          </ResponsiveDialogHeader>
          <ResponsiveDialogBody className="space-y-4">
            {goals.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No goals yet — add one below.
              </p>
            ) : (
              <ul className="space-y-2" role="list">
                {goals
                  .slice()
                  .sort((a, b) => {
                    const an = categories.get(a.categoryId)?.name ?? "";
                    const bn = categories.get(b.categoryId)?.name ?? "";
                    return an.localeCompare(bn);
                  })
                  .map((g) => (
                    <GoalRow
                      key={g.id}
                      goal={g}
                      categories={categories}
                      onChange={(patch) =>
                        void upsert({ categoryId: g.categoryId, ...patch }).catch(
                          () => {},
                        )
                      }
                      onRemove={() => void remove(g.id).catch(() => {})}
                    />
                  ))}
              </ul>
            )}
            {addable.length > 0 && (
              <AddGoalRow
                addable={addable}
                onAdd={(categoryId) =>
                  void upsert({
                    categoryId,
                    weeklyTargetMs: 5 * HOUR,
                    direction: "at-least",
                  }).catch(() => {})
                }
              />
            )}
          </ResponsiveDialogBody>
        </ResponsiveDialogContent>
      </ResponsiveDialog>
    </>
  );
}

function GoalRow({
  goal,
  categories,
  onChange,
  onRemove,
}: {
  goal: CategoryGoal;
  categories: Map<string, Category>;
  onChange: (patch: {
    weeklyTargetMs: number;
    direction: CategoryGoal["direction"];
  }) => void;
  onRemove: () => void;
}) {
  const meta = seriesMeta(goal.categoryId, categories);
  // Local text state so partial input ("2.") doesn't write through; the value
  // commits on blur/Enter, clamped to the DB CHECK range.
  const [hours, setHours] = useState(() => toHoursLabel(goal.weeklyTargetMs));

  function commitHours() {
    const parsed = Number(hours.replace(",", "."));
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setHours(toHoursLabel(goal.weeklyTargetMs));
      return;
    }
    const clamped = clampHours(parsed);
    setHours(toHoursLabel(clamped * HOUR));
    const nextMs = Math.round(clamped * HOUR);
    if (nextMs !== goal.weeklyTargetMs)
      onChange({ weeklyTargetMs: nextMs, direction: goal.direction });
  }

  return (
    <li className="flex items-center gap-2">
      <span
        className="size-2.5 shrink-0 rounded-[3px]"
        style={{ background: meta.color }}
        aria-hidden
      />
      <span className="w-24 min-w-0 flex-1 truncate text-sm sm:w-32 sm:flex-none">
        {meta.name}
      </span>
      <Input
        type="text"
        inputMode="decimal"
        value={hours}
        onChange={(e) => setHours(e.target.value)}
        onBlur={commitHours}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        }}
        className="h-9 w-16 text-right font-mono tabular-nums"
        aria-label={`${meta.name}: hours per week`}
      />
      <span className="text-xs text-muted-foreground">h/wk</span>
      <Select
        value={goal.direction}
        onValueChange={(v) =>
          onChange({
            weeklyTargetMs: goal.weeklyTargetMs,
            direction: v as CategoryGoal["direction"],
          })
        }
      >
        <SelectTrigger
          className="h-9 w-28"
          aria-label={`${meta.name}: goal direction`}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="at-least">At least</SelectItem>
          <SelectItem value="at-most">At most</SelectItem>
        </SelectContent>
      </Select>
      <Button
        variant="ghost"
        size="icon"
        className="size-11 shrink-0 text-muted-foreground sm:size-8"
        onClick={onRemove}
        aria-label={`Remove the ${meta.name} goal`}
      >
        <X />
      </Button>
    </li>
  );
}

function AddGoalRow({
  addable,
  onAdd,
}: {
  addable: Category[];
  onAdd: (categoryId: string) => void;
}) {
  const [categoryId, setCategoryId] = useState<string>("");

  return (
    <div className="flex items-center gap-2 border-t pt-3">
      <Select value={categoryId} onValueChange={setCategoryId}>
        <SelectTrigger className="h-9 flex-1" aria-label="Context to add a goal for">
          <SelectValue placeholder="Pick a context…" />
        </SelectTrigger>
        <SelectContent>
          {addable
            .slice()
            .sort((a, b) => a.name.localeCompare(b.name))
            .map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
        </SelectContent>
      </Select>
      <Button
        variant="outline"
        size="sm"
        disabled={categoryId === ""}
        onClick={() => {
          if (categoryId === "") return;
          onAdd(categoryId);
          setCategoryId("");
        }}
      >
        <Plus data-icon="inline-start" />
        Add goal
      </Button>
    </div>
  );
}
