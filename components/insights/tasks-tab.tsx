"use client";

import { useMemo } from "react";
import Link from "next/link";
import { ListChecks } from "lucide-react";
import { Bar, BarChart, XAxis, YAxis } from "recharts";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  computeTaskStats,
  statsByBoard,
  taskVelocity,
} from "@/lib/analytics/task-stats";
import { delta } from "@/lib/analytics/trends";
import { formatDuration } from "@/lib/datetime/format";
import { usePrefersReducedMotion } from "@/lib/hooks/use-reduced-motion";
import { StatCard, StatGrid } from "./stat-card";
import { bucketLabel, bucketTick } from "./series";
import { CHART_H, SectionLabel } from "./tab-bits";
import type { InsightsTabData } from "./insights-shell";

/** Lead times run to days/weeks — "9d 17h" reads better than "233h". */
function formatLeadTime(ms: number): string {
  const DAY = 86_400_000;
  if (ms < 2 * DAY) return formatDuration(ms);
  const days = Math.floor(ms / DAY);
  const hours = Math.round((ms % DAY) / 3_600_000);
  return hours > 0 ? `${days}d ${hours}h` : `${days}d`;
}

export function TasksTab({ data }: { data: InsightsTabData }) {
  const reduced = usePrefersReducedMotion();
  const { period, tasks, timeZone, now } = data;
  const { granularity } = period;

  const stats = useMemo(
    () => computeTaskStats(tasks, period.window, now, timeZone),
    [tasks, period, now, timeZone],
  );
  const prevStats = useMemo(
    () => computeTaskStats(tasks, period.prevWindow, now, timeZone),
    [tasks, period, now, timeZone],
  );
  const velocity = useMemo(
    () => taskVelocity(tasks, period.buckets),
    [tasks, period.buckets],
  );
  const boards = useMemo(
    () => statsByBoard(tasks, period.window, now, timeZone),
    [tasks, period, now, timeZone],
  );

  const hasTopLevel = useMemo(() => tasks.some((t) => t.parentId === null), [tasks]);
  if (!hasTopLevel) {
    return (
      <Empty className="border-0">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <ListChecks />
          </EmptyMedia>
          <EmptyTitle>No tasks yet</EmptyTitle>
          <EmptyDescription>
            Create tasks on a board and their throughput shows up here.
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button variant="outline" size="sm" asChild>
            <Link href="/tasks">Open tasks</Link>
          </Button>
        </EmptyContent>
      </Empty>
    );
  }

  const velocityRows = velocity.map((v) => ({
    key: String(v.start),
    full: bucketLabel({ start: v.start, end: v.end }, granularity, timeZone),
    created: v.created,
    completed: v.completed,
  }));
  const velocityConfig: ChartConfig = {
    created: { label: "Created", color: "var(--chart-4)" },
    completed: { label: "Completed", color: "var(--chart-2)" },
  };
  const boardName = (id: string | null) =>
    id === null ? "No board" : (data.boards.find((b) => b.id === id)?.name ?? "Unknown");

  return (
    <div className="space-y-6">
      <p className="sr-only">
        {stats.completedCount} tasks completed and {stats.createdCount} created in{" "}
        {period.label}. {stats.overdueOpenCount} open tasks are overdue.
      </p>

      <div className="space-y-1.5">
        <StatGrid>
          <StatCard
            label="Completed"
            value={String(stats.completedCount)}
            delta={delta(stats.completedCount, prevStats.completedCount)}
          />
          <StatCard
            label="Created"
            value={String(stats.createdCount)}
            delta={delta(stats.createdCount, prevStats.createdCount)}
          />
          <StatCard
            label="On time"
            value={
              stats.adherenceRate === null
                ? "—"
                : `${Math.round(stats.adherenceRate * 100)}%`
            }
            hint={stats.dueCount > 0 ? `${stats.dueCount} due this period` : "nothing due"}
          />
          <StatCard
            label="Overdue"
            value={String(stats.overdueOpenCount)}
            warning={stats.overdueOpenCount > 0}
            hint="open past their due day"
          />
          <StatCard
            label="Done of created"
            value={
              stats.completionRate === null
                ? "—"
                : `${Math.round(stats.completionRate * 100)}%`
            }
            hint="created this period"
          />
          <StatCard
            label="Lead time"
            value={
              stats.medianLeadTimeMs !== null
                ? formatLeadTime(stats.medianLeadTimeMs)
                : "—"
            }
            hint="median, created → done"
          />
        </StatGrid>
        <p className="text-[11px] text-muted-foreground">
          Top-level tasks only — subtasks count toward their parent.
        </p>
      </div>

      <section className="space-y-1.5">
        <SectionLabel>Velocity per {granularity}</SectionLabel>
        <ChartContainer
          config={velocityConfig}
          className={`aspect-auto ${CHART_H.compact} w-full`}
          aria-label={`Tasks created vs completed per ${granularity}, ${period.label}`}
        >
          <BarChart data={velocityRows} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
            <XAxis
              dataKey="key"
              tickLine={false}
              axisLine={false}
              tickMargin={6}
              minTickGap={24}
              interval="preserveStartEnd"
              tickFormatter={(v: string) => bucketTick(Number(v), granularity, timeZone)}
            />
            <YAxis hide domain={[0, "dataMax"]} allowDecimals={false} />
            <ChartTooltip
              cursor={false}
              content={
                <ChartTooltipContent
                  labelFormatter={(_l, payload) =>
                    (payload?.[0]?.payload as { full?: string } | undefined)?.full ?? ""
                  }
                />
              }
            />
            <ChartLegend content={<ChartLegendContent />} />
            <Bar
              dataKey="created"
              fill="var(--color-created)"
              radius={[3, 3, 0, 0]}
              isAnimationActive={!reduced}
            />
            <Bar
              dataKey="completed"
              fill="var(--color-completed)"
              radius={[3, 3, 0, 0]}
              isAnimationActive={!reduced}
            />
          </BarChart>
        </ChartContainer>
      </section>

      {boards.length > 1 && (
        <section className="space-y-1.5">
          <SectionLabel>By board</SectionLabel>
          <table className="w-full text-xs">
            <caption className="sr-only">Task throughput per board, {period.label}</caption>
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th scope="col" className="py-1.5 font-medium">
                  Board
                </th>
                <th scope="col" className="py-1.5 text-right font-medium">
                  Done
                </th>
                <th scope="col" className="py-1.5 text-right font-medium">
                  Created
                </th>
                <th scope="col" className="py-1.5 text-right font-medium">
                  Due
                </th>
                <th scope="col" className="py-1.5 text-right font-medium">
                  Overdue
                </th>
              </tr>
            </thead>
            <tbody>
              {boards.map((b) => (
                <tr key={b.boardId ?? "none"} className="border-b border-border/60">
                  <td className="max-w-0 truncate py-1.5">{boardName(b.boardId)}</td>
                  <td className="py-1.5 text-right font-mono tabular-nums">
                    {b.completedCount}
                  </td>
                  <td className="py-1.5 text-right font-mono tabular-nums">
                    {b.createdCount}
                  </td>
                  <td className="py-1.5 text-right font-mono tabular-nums">
                    {b.dueCount}
                  </td>
                  <td
                    className={
                      b.overdueOpenCount > 0
                        ? "py-1.5 text-right font-mono tabular-nums text-destructive"
                        : "py-1.5 text-right font-mono tabular-nums text-muted-foreground"
                    }
                  >
                    {b.overdueOpenCount}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}
