"use client";

// The shared shadcn-backed frame for insights sections. Every chart/list/table
// section renders through InsightCard so the tabs read as one cohesive set of
// dashboard tiles instead of loose, hand-built boxes. Three pieces live here:
//   · InsightCard — a Card with title / takeaway description / action / info
//   · MetricInfo  — the small "what is this" affordance (HoverCard explainer)
//   · Takeaway    — the one-line period summary shown at the top of each tab
// No recharts here: this module is safe to pull into the route bundle.

import { Info, Lightbulb } from "lucide-react";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import { METRIC_DEFS, type MetricKey } from "@/lib/insights/metric-defs";
import { cn } from "@/lib/utils";

/**
 * A hoverable/focusable "i" that explains a metric — definition, how it's
 * computed, and any caveat — from the central METRIC_DEFS registry. Works on
 * hover, keyboard focus, and tap (Radix HoverCard), so the help is reachable
 * everywhere without crowding the card with prose.
 */
export function MetricInfo({ metric, label }: { metric: MetricKey; label: string }) {
  const def = METRIC_DEFS[metric];
  return (
    <HoverCard openDelay={120} closeDelay={80}>
      <HoverCardTrigger asChild>
        <button
          type="button"
          aria-label={`About ${label}`}
          className="inline-flex size-5 shrink-0 items-center justify-center rounded-full text-muted-foreground/60 transition-colors hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          <Info className="size-3.5" aria-hidden />
        </button>
      </HoverCardTrigger>
      <HoverCardContent align="start" className="w-72 space-y-1.5">
        <p className="text-sm font-medium text-foreground">{label}</p>
        <p className="text-xs text-muted-foreground">{def.definition}</p>
        <p className="text-xs text-muted-foreground">
          <span className="font-medium text-foreground/80">How: </span>
          {def.howComputed}
        </p>
        {def.note && <p className="text-xs text-muted-foreground/80">{def.note}</p>}
      </HoverCardContent>
    </HoverCard>
  );
}

/**
 * Section tile. `title` is the heading, `description` the takeaway sentence
 * (the meaning, not just the metric name), `action` the top-right control
 * (chart options, "manage", …), and `metric` wires the MetricInfo explainer
 * into the header. Children are the body (chart, list, table).
 */
export function InsightCard({
  title,
  description,
  action,
  metric,
  className,
  contentClassName,
  children,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  /** show a MetricInfo explainer beside the title */
  metric?: MetricKey;
  className?: string;
  contentClassName?: string;
  children: React.ReactNode;
}) {
  return (
    <Card size="sm" className={cn("gap-3", className)}>
      <CardHeader>
        <CardTitle className="flex items-center gap-1.5 text-sm">
          <span className="min-w-0 truncate">{title}</span>
          {metric && (
            <MetricInfo metric={metric} label={typeof title === "string" ? title : ""} />
          )}
        </CardTitle>
        {description && (
          <CardDescription className="text-sm font-medium text-foreground">
            {description}
          </CardDescription>
        )}
        {action && <CardAction>{action}</CardAction>}
      </CardHeader>
      <CardContent className={cn("min-w-0", contentClassName)}>{children}</CardContent>
    </Card>
  );
}

/**
 * The one-line "key takeaway" banner at the top of a tab — a calm muted strip
 * that surfaces the sentence each tab already computes. Renders nothing when
 * there's no takeaway (e.g. an empty period), so callers can pass freely.
 */
export function Takeaway({
  children,
  className,
}: {
  children?: React.ReactNode;
  className?: string;
}) {
  if (!children) return null;
  return (
    <div
      className={cn(
        "flex items-start gap-2.5 rounded-2xl bg-muted/50 px-3.5 py-2.5 text-sm",
        className,
      )}
    >
      <Lightbulb aria-hidden className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      <p className="text-foreground/90">{children}</p>
    </div>
  );
}
