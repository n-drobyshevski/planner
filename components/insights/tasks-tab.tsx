"use client";

import { useMemo } from "react";
import { useLocale, useTranslations } from "next-intl";
import { ListChecks } from "lucide-react";
import { Bar, BarChart, YAxis } from "recharts";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { COMPARISON_COLOR, COMPARISON_OPACITY } from "@/lib/insights/palette";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Link } from "@/i18n/navigation";
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
import { formatDuration } from "@/lib/datetime/format";
import { deriveTasksLede } from "@/lib/insights/ledes";
import { usePrefersReducedMotion } from "@/lib/hooks/use-reduced-motion";
import { StatCard, StatGrid } from "./stat-card";
import { InsightLede } from "./insight-lede";
import {
  INSIGHTS_CHART_MARGIN,
  insightsGrid,
  insightsXAxis,
} from "./chart-frame";
import { bucketLabel, bucketTick } from "./series";
import { CHART_H, Reading, SectionLabel, TabGrid } from "./tab-bits";
import type { InsightsTabData } from "./insights-shell";

/** Lead times run to days/weeks — "9d 17h" reads better than "233h". */
function formatLeadTime(
  ms: number,
  t: ReturnType<typeof useTranslations<"insights">>,
  locale: string,
): string {
  const DAY = 86_400_000;
  if (ms < 2 * DAY) return formatDuration(ms, locale);
  const days = Math.floor(ms / DAY);
  const hours = Math.round((ms % DAY) / 3_600_000);
  return hours > 0
    ? t("tasks.leadDaysHours", { days, hours })
    : t("tasks.leadDays", { days });
}

export function TasksTab({ data }: { data: InsightsTabData }) {
  const t = useTranslations("insights");
  const locale = useLocale();
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
          <EmptyTitle>{t("tasks.emptyTitle")}</EmptyTitle>
          <EmptyDescription>
            {t("tasks.emptyDescription")}
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button variant="outline" size="sm" asChild>
            <Link href="/tasks">{t("tasks.openTasks")}</Link>
          </Button>
        </EmptyContent>
      </Empty>
    );
  }

  const velocityRows = velocity.map((v) => ({
    key: String(v.start),
    full: bucketLabel({ start: v.start, end: v.end }, granularity, timeZone, locale),
    created: v.created,
    completed: v.completed,
  }));
  const velocityConfig: ChartConfig = {
    completed: { label: t("tasks.seriesCompleted"), color: "var(--chart-2)" },
    created: { label: t("tasks.seriesCreated"), color: COMPARISON_COLOR },
  };
  const boardName = (id: string | null) =>
    id === null
      ? t("tasks.noBoard")
      : (data.boards.find((b) => b.id === id)?.name ?? t("tasks.unknownBoard"));

  const hasBoardBreakdown = boards.length > 1;

  const lede = deriveTasksLede({ stats, prevStats, preset: data.preset, t, locale });

  const leadFigures = [
    { label: t("tasks.leadCompleted"), value: String(stats.completedCount) },
    { label: t("tasks.leadCreated"), value: String(stats.createdCount) },
    {
      label: t("tasks.leadOnTime"),
      value:
        stats.adherenceRate === null
          ? "—"
          : `${Math.round(stats.adherenceRate * 100)}%`,
      hint:
        stats.dueCount > 0
          ? t("tasks.onTimeDue", { count: stats.dueCount })
          : t("tasks.onTimeNothing"),
    },
  ];

  return (
    <Reading>
      <p className="sr-only">
        {t("tasks.srSummary", {
          completed: stats.completedCount,
          created: stats.createdCount,
          label: period.label,
          overdue: stats.overdueOpenCount,
        })}
      </p>

      <InsightLede lede={lede} figures={leadFigures} />

      <TabGrid>
      <div className="space-y-2 lg:col-span-2">
        <StatGrid>
          <StatCard
            flat
            label={t("tasks.overdue")}
            value={String(stats.overdueOpenCount)}
            warning={stats.overdueOpenCount > 0}
            hint={t("tasks.overdueHint")}
          />
          <StatCard
            flat
            label={t("tasks.doneOfCreated")}
            value={
              stats.completionRate === null
                ? "—"
                : `${Math.round(stats.completionRate * 100)}%`
            }
            hint={t("tasks.doneOfCreatedHint")}
          />
          <StatCard
            flat
            label={t("tasks.leadTime")}
            value={
              stats.medianLeadTimeMs !== null
                ? formatLeadTime(stats.medianLeadTimeMs, t, locale)
                : "—"
            }
            hint={t("tasks.leadTimeHint")}
          />
        </StatGrid>
        <p className="text-[11px] text-muted-foreground">
          {t("tasks.topLevelNote")}
        </p>
      </div>

      <section className={hasBoardBreakdown ? "space-y-1.5" : "space-y-1.5 lg:col-span-2"}>
        <SectionLabel>{t("tasks.velocity", { granularity })}</SectionLabel>
        <ChartContainer
          config={velocityConfig}
          className={`aspect-auto ${CHART_H.compact} w-full`}
          aria-label={t("tasks.velocityAria", { granularity, label: period.label })}
        >
          <BarChart data={velocityRows} margin={INSIGHTS_CHART_MARGIN}>
            {insightsGrid()}
            {insightsXAxis({
              tickFormatter: (v) => bucketTick(Number(v), granularity, timeZone, locale),
            })}
            <YAxis hide domain={[0, "dataMax"]} allowDecimals={false} tickCount={3} />
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
              dataKey="completed"
              fill="var(--color-completed)"
              radius={[3, 3, 0, 0]}
              isAnimationActive={!reduced}
            />
            <Bar
              dataKey="created"
              fill="var(--color-created)"
              fillOpacity={COMPARISON_OPACITY}
              radius={[3, 3, 0, 0]}
              isAnimationActive={!reduced}
            />
          </BarChart>
        </ChartContainer>
      </section>

      {hasBoardBreakdown && (
        <section className="space-y-1.5">
          <SectionLabel>{t("tasks.byBoard")}</SectionLabel>
          <Table className="text-xs">
            <TableCaption className="sr-only">
              {t("tasks.byBoardCaption", { label: period.label })}
            </TableCaption>
            <TableHeader>
              <TableRow className="text-muted-foreground hover:bg-transparent">
                <TableHead scope="col" className="h-auto px-0 py-1.5 text-muted-foreground">
                  {t("tasks.colBoard")}
                </TableHead>
                <TableHead scope="col" className="h-auto px-0 py-1.5 text-right text-muted-foreground">
                  {t("tasks.colDone")}
                </TableHead>
                <TableHead scope="col" className="h-auto px-0 py-1.5 text-right text-muted-foreground">
                  {t("tasks.colCreated")}
                </TableHead>
                <TableHead scope="col" className="h-auto px-0 py-1.5 text-right text-muted-foreground">
                  {t("tasks.colDue")}
                </TableHead>
                <TableHead scope="col" className="h-auto px-0 py-1.5 text-right text-muted-foreground">
                  {t("tasks.colOverdue")}
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
    </Reading>
  );
}
