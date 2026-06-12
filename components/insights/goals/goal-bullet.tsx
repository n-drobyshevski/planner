"use client";

import { Progress } from "@/components/ui/progress";
import { formatDuration } from "@/lib/datetime/format";
import type { GoalProgress } from "@/lib/insights/goals";
import { cn } from "@/lib/utils";

/** Calm wording per judgment; never color alone (the label always renders). */
const JUDGMENT_LABEL: Record<GoalProgress["judgment"], string> = {
  met: "met",
  "on-track": "on track",
  behind: "behind pace",
  over: "over budget",
};

/**
 * One goal as a bullet bar (research: bullets beat gauges for goal progress):
 * the track spans max(target, actual), a tick marks the scaled target, a thin
 * pace marker shows where "on pace" sits mid-window. Pure presentation — the
 * caller computes GoalProgress and supplies the category's name/color.
 */
export function GoalBullet({
  progress,
  name,
  color,
}: {
  progress: GoalProgress;
  name: string;
  color: string;
}) {
  const { goal, targetMs, actualMs, judgment, expected } = progress;
  const spanMs = Math.max(targetMs, actualMs, 1);
  const fillPct = (actualMs / spanMs) * 100;
  const targetPct = (targetMs / spanMs) * 100;
  const pacePct =
    expected !== null && expected > 0 && expected < 1
      ? ((expected * targetMs) / spanMs) * 100
      : null;

  const direction = goal.direction === "at-least" ? "target" : "budget";
  const srLabel =
    `${name}: ${formatDuration(actualMs)} of the ${formatDuration(targetMs)} ` +
    `${direction} for this period — ${JUDGMENT_LABEL[judgment]}.`;

  return (
    <li className="flex items-center gap-2 text-xs">
      <span
        className="size-2.5 shrink-0 rounded-[3px]"
        style={{ background: color }}
        aria-hidden
      />
      <span className="w-28 min-w-0 truncate sm:w-36">{name}</span>
      {/* Progress draws the track + fill (and a real progressbar role); the
          bullet-specific target tick and pace marker overlay it, so they sit
          in a relative wrapper rather than inside the clipped track. */}
      <span className="relative min-w-0 flex-1">
        <Progress
          value={fillPct}
          aria-label={srLabel}
          className="h-2 rounded-full *:data-[slot=progress-indicator]:rounded-full *:data-[slot=progress-indicator]:bg-(--bullet-color)"
          style={{ "--bullet-color": color } as React.CSSProperties}
        />
        {/* target tick */}
        <span
          aria-hidden
          className="absolute inset-y-0 w-0.5 bg-foreground/60"
          style={{ left: `calc(${targetPct}% - 1px)` }}
        />
        {/* pace marker (mid-window only) */}
        {pacePct !== null && (
          <span
            aria-hidden
            className="absolute inset-y-0 w-px bg-foreground/30"
            style={{ left: `${pacePct}%` }}
          />
        )}
      </span>
      <span className="w-24 text-right font-mono tabular-nums text-muted-foreground sm:w-28">
        {formatDuration(actualMs)}
        <span className="text-muted-foreground/60"> / {formatDuration(targetMs)}</span>
      </span>
      <span
        className={cn(
          "w-20 text-right",
          judgment === "over" && "text-destructive",
          judgment === "met" && "font-medium",
          (judgment === "on-track" || judgment === "behind") &&
            "text-muted-foreground",
        )}
      >
        {JUDGMENT_LABEL[judgment]}
      </span>
    </li>
  );
}
