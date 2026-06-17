"use client";

import { useLocale, useTranslations } from "next-intl";
import {
  BedDouble,
  CircleAlert,
  Info,
  Repeat,
  Waves,
  type LucideIcon,
} from "lucide-react";

import { Link } from "@/i18n/navigation";
import { formatDuration } from "@/lib/datetime/format";
import {
  HINTS_MIN_LOGGED,
  HINTS_WINDOW_DAYS,
  type SleepHint,
  type SleepHintVars,
} from "@/lib/sleep/adaptive";
import { SectionLabel } from "../tab-bits";

const KIND_ICONS: Record<SleepHint["kind"], LucideIcon> = {
  duration: BedDouble,
  regularity: Repeat,
  "cycle-alignment": Waves,
};

/**
 * Adaptive hints from logged check-ins over a fixed trailing window
 * (period-independent, so switching to a short period can't silence them).
 * The engine stays silent below HINTS_MIN_LOGGED scored mornings — surface
 * that honestly instead of implying the data says nothing.
 */
export function HintsSection({
  hints,
  scoredCount,
}: {
  hints: SleepHint[];
  /** check-ins with a quality or sleepiness score in the trailing window */
  scoredCount: number;
}) {
  const t = useTranslations("sleep");
  return (
    <section className="space-y-2">
      <SectionLabel>{t("hints.label", { days: HINTS_WINDOW_DAYS })}</SectionLabel>
      {scoredCount < HINTS_MIN_LOGGED ? (
        <p className="text-xs text-muted-foreground">
          {t.rich("hints.unlock", {
            count: HINTS_MIN_LOGGED - scoredCount,
            link: (chunks) => (
              <Link
                href="/settings?section=sleep"
                className="underline underline-offset-2 hover:text-foreground"
              >
                {chunks}
              </Link>
            ),
          })}
        </p>
      ) : hints.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          {t("hints.noPatterns", { days: HINTS_WINDOW_DAYS })}
        </p>
      ) : (
        <ul role="list" className="flex flex-col gap-3">
          {hints.map((h) => (
            <HintCard key={h.id} hint={h} />
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * Turn the engine's raw hint vars into ICU arguments: counts/spread/cycle pass
 * straight through; `targetMs` is formatted to a locale-aware duration string.
 * Extra args are harmless — next-intl only complains about missing ones.
 */
function icuArgs(
  vars: SleepHintVars,
  locale: string,
): Record<string, string | number> {
  const args: Record<string, string | number> = { count: vars.count };
  if (vars.targetMs !== undefined) args.target = formatDuration(vars.targetMs, locale);
  if (vars.targetMs !== undefined) args.duration = formatDuration(vars.targetMs, locale);
  if (vars.spread !== undefined) args.spread = vars.spread;
  if (vars.cycle !== undefined) args.cycle = vars.cycle;
  return args;
}

function HintCard({ hint }: { hint: SleepHint }) {
  const t = useTranslations("sleep");
  const locale = useLocale();
  const KindIcon = KIND_ICONS[hint.kind];
  const SeverityIcon = hint.severity === "attention" ? CircleAlert : Info;
  return (
    <li className="flex items-start gap-3 px-0.5">
      <KindIcon aria-hidden className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span className="text-sm font-medium">
            {t(`hints.${hint.titleKey}`, icuArgs(hint.vars, locale))}
          </span>
          <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
            <SeverityIcon aria-hidden className="size-3" />
            {hint.severity === "attention" ? t("hints.worthALook") : t("hints.fyi")}
          </span>
        </div>
        <p className="mt-0.5 text-sm text-muted-foreground">
          {t(`hints.${hint.bodyKey}`, icuArgs(hint.vars, locale))}
        </p>
        {hint.meta && hint.meta.length > 0 && (
          <p className="mt-1 text-xs text-muted-foreground tabular-nums">
            {hint.meta.map((m) => t(`hints.${m.key}`, icuArgs(m.vars, locale))).join(" · ")}
          </p>
        )}
      </div>
    </li>
  );
}
