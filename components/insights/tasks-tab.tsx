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
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
import { deriveTasksLede } from "@/lib/insights/ledes";
import { usePrefersReducedMotion } from "@/lib/hooks/use-reduced-motion";
import { StatCard, StatGrid } from "./stat-card";
import { InsightLede } from "./insight-lede";
import { bucketLabel, bucketTick } from "./series";
import { CHART_H, SectionLabel, TabGrid } from "./tab-bits";
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

  const hasBoardBreakdown = boards.length > 1;

  const lede = deriveTasksLede({ stats, prevStats, preset: data.preset });

  return (
    <div className="space-y-4">
      <p className="sr-only">
        {stats.completedCount} tasks completed and {stats.createdCount} created in{" "}
        {period.label}. {stats.overdueOpenCount} open tasks are overdue.
      </p>

      <InsightLede lede={lede} />

      <TabGrid>
      <div className="space-y-1.5 xl:col-span-2">
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

      <section className={hasBoardBreakdown ? "space-y-1.5" : "space-y-1.5 xl:col-span-2"}>
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

      {hasBoardBreakdown && (
        <section className="space-y-1.5">
          <SectionLabel>By board</SectionLabel>
          <Table className="text-xs">
            <TableCaption className="sr-only">
              Task throughput per board, {period.label}
            </TableCaption>
            <TableHeader>
              <TableRow className="text-muted-foreground hover:bg-transparent">
                <TableHead scope="col" className="h-auto px-0 py-1.5 text-muted-foreground">
                  Board
                </TableHead>
                <TableHead scope="col" className="h-auto px-0 py-1.5 text-right text-muted-foreground">
                  Done
                </TableHead>
                <TableHead scope="col" className="h-auto px-0 py-1.5 text-right text-muted-foreground">
                  Created
                </TableHead>
                <TableHead scope="col" className="h-auto px-0 py-1.5 text-right text-muted-foreground">
                  Due
                </TableHead>
                <TableHead scope="col" className="h-auto px-0 py-1.5 text-right text-muted-foreground">
                  Overdue
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {boards.map((b) => (
                <TableRow key={b.boardId ?? "none"} className="border-border/60">
                  <TableCell className="max-w-0 truncate px-0 py-1.5">
                    {boardName(b.boardId)}
                  </TableCell>
                  <TableCell className="px-0 py-1.5 text-right font-mono tabular-nums">
                    {b.completedCount}
                  </TableCell>
                  <TableCell className="px-0 py-1.5 text-right font-mono tabular-nums">
                    {b.createdCount}
                  </TableCell>
                  <TableCell className="px-0 py-1.5 text-right font-mono tabular-nums">
                    {b.dueCount}
                  </TableCell>
                  <TableCell
                    className={
                      b.overdueOpenCount > 0
                        ? "px-0 py-1.5 text-right font-mono tabular-nums text-destructive"
                        : "px-0 py-1.5 text-right font-mono tabular-nums text-muted-foreground"
                    }
                  >
                    {b.overdueOpenCount}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </section>
      )}
      </TabGrid>
    </div>
  );
}
