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
import type { Lede, LedeTone } from "@/lib/insights/ledes";

const TONE_ICONS: Record<LedeTone, LucideIcon> = {
  neutral: Info,
  attention: CircleAlert,
};

export function InsightLede({ lede, className }: { lede: Lede; className?: string }) {
  const Icon = TONE_ICONS[lede.tone];
  return (
    <div className={cn("flex items-start gap-2 px-0.5", className)}>
      <Icon
        aria-hidden
        className={cn(
          "mt-0.5 size-4 shrink-0",
          lede.tone === "attention" ? "text-destructive" : "text-muted-foreground",
        )}
      />
      <div className="min-w-0 space-y-0.5">
        <p className="text-base leading-snug font-medium text-balance">
          {lede.tone === "attention" && (
            <span className="sr-only">Needs attention: </span>
          )}
          {lede.headline}
        </p>
        {lede.support && (
          <p className="text-sm text-muted-foreground">{lede.support}</p>
        )}
      </div>
    </div>
  );
}
