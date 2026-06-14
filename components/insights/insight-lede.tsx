// The tab lede: one plain-language sentence at the top of an Insights view —
// the answer, before the charts. Not a card and not a hero metric; it sits
// directly on the paper. Prominence comes from position + a leading icon, not
// from display type (the headline stays at the 1rem body ceiling).
//
// Tone is signalled three ways at once, never by color alone: the icon SHAPE
// (Info vs CircleAlert), an sr-only "Needs attention:" prefix, and the icon
// tint. The headline text itself stays full-contrast foreground so an
// "attention" lede informs without shouting — the calm register has no red
// alarms for a couple's own schedule.

import { CircleAlert, Info, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { LeadFigures } from "./tab-bits";
import type { Lede, LedeTone } from "@/lib/insights/ledes";

const TONE_ICONS: Record<LedeTone, LucideIcon> = {
  neutral: Info,
  attention: CircleAlert,
};

export interface LeadFigure {
  label: string;
  value: string;
  hint?: string;
}

/**
 * The answer zone — the first movement of an Insights "reading". The headline
 * sentence leads at full contrast and weight; the support clause and the two or
 * three lead figures sit under it as quiet label-over-value pairs on the paper.
 * Prominence comes from position, weight, and the surrounding space, never from
 * display size (the scale still tops out near 1rem) or a bordered hero card.
 */
export function InsightLede({
  lede,
  figures,
  className,
}: {
  lede: Lede;
  figures?: LeadFigure[];
  className?: string;
}) {
  const Icon = TONE_ICONS[lede.tone];
  return (
    <header className={cn("flex items-start gap-2.5 px-0.5", className)}>
      <Icon
        aria-hidden
        className={cn(
          "mt-1 size-4 shrink-0",
          lede.tone === "attention" ? "text-destructive" : "text-muted-foreground",
        )}
      />
      <div className="min-w-0 flex-1 space-y-3">
        <div className="space-y-1">
          <p className="text-base leading-snug font-semibold text-balance">
            {lede.tone === "attention" && (
              <span className="sr-only">Needs attention: </span>
            )}
            {lede.headline}
          </p>
          {lede.support && (
            <p className="text-sm leading-snug text-muted-foreground text-pretty">
              {lede.support}
            </p>
          )}
        </div>
        {figures && figures.length > 0 && <LeadFigures items={figures} />}
      </div>
    </header>
  );
}
