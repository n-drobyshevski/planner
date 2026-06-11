"use client";

import { useMemo } from "react";

import { goalProgress } from "@/lib/insights/goals";
import { useCategoryGoals } from "@/lib/hooks/use-category-goals";
import type { InsightsTabData } from "../insights-shell";
import { SectionLabel } from "../tab-bits";
import { seriesMeta } from "../series";
import { GoalBullet } from "./goal-bullet";
import { ManageGoalsDialog } from "./manage-goals-dialog";

/**
 * Goal progress for the viewed period: one bullet per workspace goal, judged
 * against the period's per-category tracked time (insights-filtered, so a
 * hidden category's goal hides with it). Used by the Balance tab and the
 * Overview dashboard's "goals" card — both render the same truth.
 */
export function GoalsSection({
  data,
  actualByCategory,
}: {
  data: InsightsTabData;
  /** tracked ms per categoryId over the focused window (caller-computed) */
  actualByCategory: ReadonlyMap<string | null, number>;
}) {
  const { workspaceId, viewerId, categories, period, now } = data;
  const { goals, isLoading } = useCategoryGoals(workspaceId);

  const rows = useMemo(
    () =>
      goals
        .filter((g) => categories.has(g.categoryId))
        .map((g) => ({
          goal: g,
          progress: goalProgress(
            g,
            actualByCategory.get(g.categoryId) ?? 0,
            period.days,
            period.window,
            now,
          ),
        }))
        .sort((a, b) => {
          const an = categories.get(a.goal.categoryId)?.name ?? "";
          const bn = categories.get(b.goal.categoryId)?.name ?? "";
          return an.localeCompare(bn);
        }),
    [goals, categories, actualByCategory, period, now],
  );

  const manage = (
    <ManageGoalsDialog
      workspaceId={workspaceId}
      viewerId={viewerId}
      categories={categories}
    />
  );

  return (
    <section className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <SectionLabel>Goals</SectionLabel>
        {manage}
      </div>
      {rows.length === 0 ? (
        <div className="rounded-lg border border-dashed p-3">
          <p className="text-xs text-muted-foreground">
            {isLoading
              ? "Loading goals…"
              : "Set a weekly target (or budget) for a context to see progress here — the tick marks the goal, the thin line marks today's pace."}
          </p>
        </div>
      ) : (
        <ul className="space-y-1.5" role="list">
          {rows.map(({ goal, progress }) => {
            const meta = seriesMeta(goal.categoryId, categories);
            return (
              <GoalBullet
                key={goal.id}
                progress={progress}
                name={meta.name}
                color={meta.color}
              />
            );
          })}
        </ul>
      )}
    </section>
  );
}
