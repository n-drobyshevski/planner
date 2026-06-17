"use client";

import { useEffect } from "react";
import { useForm } from "@tanstack/react-form";
import { useTranslations } from "next-intl";

import { SettingsSection } from "@/components/settings/settings-section";
import {
  Field,
  FieldDescription,
  FieldLabel,
  FieldSet,
} from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatDuration } from "@/lib/datetime/format";
import { usePreferences } from "@/lib/hooks/use-preferences";
import { useWorkspace } from "@/lib/hooks/use-workspace";

const MIN_MS = 60_000;
/** Radix Select items can't carry "", so the heuristic gets a sentinel. */
const NO_SLEEP_CATEGORY = "none";

function range(from: number, to: number, step: number): number[] {
  const out: number[] = [];
  for (let v = from; v <= to; v += step) out.push(v);
  return out;
}

const hourLabel = (h: number) => `${String(h).padStart(2, "0")}:00`;

/**
 * Sleep planning preferences feeding the Insights Sleep tab (calculator,
 * Tonight card, target line, hints). Selects rather than free inputs so the
 * client can never submit a value outside the DB check constraints.
 *
 * Instant apply: each field's onChange listener writes straight through the
 * preference setter — there is no Save step, matching the rest of /settings.
 */
export function SleepSettings() {
  const t = useTranslations("settings");
  const {
    sleepCycleLengthMin,
    sleepOnsetLatencyMin,
    targetSleepCycles,
    sleepCategoryId,
    nightWindowStartHour,
    nightWindowEndHour,
    setSleepCycleLength,
    setSleepOnsetLatency,
    setTargetSleepCycles,
    setSleepCategory,
    setNightWindowStart,
    setNightWindowEnd,
    isReady,
  } = usePreferences();
  const disabled = !isReady;

  // Categories the viewer could file sleep under: their own and shared ones.
  const workspace = useWorkspace();
  const viewerId = workspace.data?.currentMember?.id;
  const sleepCategoryChoices = (workspace.data?.categories ?? []).filter(
    (c) => c.ownerId === null || c.ownerId === viewerId,
  );

  const targetMs =
    (targetSleepCycles * sleepCycleLengthMin + sleepOnsetLatencyMin) * MIN_MS;
  const asleepMs = targetSleepCycles * sleepCycleLengthMin * MIN_MS;
  const SEVEN_HOURS_MS = 7 * 60 * MIN_MS;

  const current = {
    cycleLength: String(sleepCycleLengthMin),
    onsetLatency: String(sleepOnsetLatencyMin),
    targetCycles: String(targetSleepCycles),
    categoryId: sleepCategoryId ?? NO_SLEEP_CATEGORY,
    windowStart: String(nightWindowStartHour),
    windowEnd: String(nightWindowEndHour),
  };

  const form = useForm({ defaultValues: current });

  // Preferences load (and can change) outside the form — resync so the
  // selects never go stale. Writes echo back identical values, so this
  // no-ops right after a local change.
  useEffect(() => {
    form.reset(current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    sleepCycleLengthMin,
    sleepOnsetLatencyMin,
    targetSleepCycles,
    sleepCategoryId,
    nightWindowStartHour,
    nightWindowEndHour,
  ]);

  return (
    <SettingsSection title={t("sleep.title")} description={t("sleep.description")}>
      <form.Field
        name="cycleLength"
          listeners={{
            onChange: ({ value }) => setSleepCycleLength(Number(value)),
          }}
        >
          {(field) => (
            <Field>
              <FieldLabel htmlFor="sleep-cycle-length">{t("sleep.cycleLength.label")}</FieldLabel>
              <Select value={field.state.value} onValueChange={field.handleChange}>
                <SelectTrigger id="sleep-cycle-length" disabled={disabled} className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {range(70, 110, 5).map((v) => (
                    <SelectItem key={v} value={String(v)}>
                      <span className="tabular-nums">{t("sleep.cycleLength.option", { minutes: v })}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FieldDescription>
                {t("sleep.cycleLength.description")}
              </FieldDescription>
            </Field>
          )}
        </form.Field>

        <form.Field
          name="onsetLatency"
          listeners={{
            onChange: ({ value }) => setSleepOnsetLatency(Number(value)),
          }}
        >
          {(field) => (
            <Field>
              <FieldLabel htmlFor="sleep-onset-latency">{t("sleep.onsetLatency.label")}</FieldLabel>
              <Select value={field.state.value} onValueChange={field.handleChange}>
                <SelectTrigger id="sleep-onset-latency" disabled={disabled} className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {range(0, 60, 5).map((v) => (
                    <SelectItem key={v} value={String(v)}>
                      <span className="tabular-nums">{t("sleep.onsetLatency.option", { minutes: v })}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FieldDescription>
                {t("sleep.onsetLatency.description")}
              </FieldDescription>
            </Field>
          )}
        </form.Field>

        <form.Field
          name="targetCycles"
          listeners={{
            onChange: ({ value }) => setTargetSleepCycles(Number(value)),
          }}
        >
          {(field) => (
            <Field>
              <FieldLabel htmlFor="sleep-target-cycles">{t("sleep.targetCycles.label")}</FieldLabel>
              <Select value={field.state.value} onValueChange={field.handleChange}>
                <SelectTrigger id="sleep-target-cycles" disabled={disabled} className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {range(3, 7, 1).map((v) => (
                    <SelectItem key={v} value={String(v)}>
                      <span className="tabular-nums">{t("sleep.targetCycles.option", { cycles: v })}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FieldDescription>
                {t(
                  asleepMs < SEVEN_HOURS_MS
                    ? "sleep.targetCycles.descriptionShort"
                    : "sleep.targetCycles.description",
                  {
                    inBed: formatDuration(targetMs),
                    asleep: formatDuration(asleepMs),
                  },
                )}
              </FieldDescription>
            </Field>
          )}
        </form.Field>

        <form.Field
          name="categoryId"
          listeners={{
            onChange: ({ value }) =>
              setSleepCategory(value === NO_SLEEP_CATEGORY ? null : value),
          }}
        >
          {(field) => (
            <Field>
              <FieldLabel htmlFor="sleep-category">{t("sleep.category.label")}</FieldLabel>
              <Select value={field.state.value} onValueChange={field.handleChange}>
                <SelectTrigger id="sleep-category" disabled={disabled} className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_SLEEP_CATEGORY}>
                    {t("sleep.category.none")}
                  </SelectItem>
                  {sleepCategoryChoices.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FieldDescription>
                {t("sleep.category.description")}
              </FieldDescription>
            </Field>
          )}
        </form.Field>

        <FieldSet>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-3">
          <form.Field
            name="windowStart"
            listeners={{
              onChange: ({ value }) => setNightWindowStart(Number(value)),
            }}
          >
            {(field) => (
              <Field>
                <FieldLabel htmlFor="night-window-start">{t("sleep.nightWindow.startLabel")}</FieldLabel>
                <Select value={field.state.value} onValueChange={field.handleChange}>
                  <SelectTrigger
                    id="night-window-start"
                    disabled={disabled}
                    className="w-full"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {range(12, 23, 1).map((h) => (
                      <SelectItem key={h} value={String(h)}>
                        <span className="tabular-nums">{hourLabel(h)}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            )}
          </form.Field>
          <form.Field
            name="windowEnd"
            listeners={{
              onChange: ({ value }) => setNightWindowEnd(Number(value)),
            }}
          >
            {(field) => (
              <Field>
                <FieldLabel htmlFor="night-window-end">{t("sleep.nightWindow.endLabel")}</FieldLabel>
                <Select value={field.state.value} onValueChange={field.handleChange}>
                  <SelectTrigger
                    id="night-window-end"
                    disabled={disabled}
                    className="w-full"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {range(4, 16, 1).map((h) => (
                      <SelectItem key={h} value={String(h)}>
                        <span className="tabular-nums">{hourLabel(h)}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            )}
          </form.Field>
          </div>
          <FieldDescription>
            {t("sleep.nightWindow.description")}
          </FieldDescription>
        </FieldSet>
    </SettingsSection>
  );
}
