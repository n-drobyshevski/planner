"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatDuration } from "@/lib/datetime/format";
import { usePreferences } from "@/lib/hooks/use-preferences";

const MIN_MS = 60_000;

function range(from: number, to: number, step: number): number[] {
  const out: number[] = [];
  for (let v = from; v <= to; v += step) out.push(v);
  return out;
}

/**
 * Sleep planning preferences feeding the Insights Sleep tab (calculator,
 * Tonight card, target line, hints). Selects rather than free inputs so the
 * client can never submit a value outside the DB check constraints.
 */
export function SleepSettings() {
  const {
    sleepCycleLengthMin,
    sleepOnsetLatencyMin,
    targetSleepCycles,
    setSleepCycleLength,
    setSleepOnsetLatency,
    setTargetSleepCycles,
    isReady,
  } = usePreferences();
  const disabled = !isReady;

  const targetMs =
    (targetSleepCycles * sleepCycleLengthMin + sleepOnsetLatencyMin) * MIN_MS;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Sleep</CardTitle>
        <CardDescription>
          Drives the sleep-cycle calculator and tonight&apos;s bedtime
          recommendation on the Insights Sleep tab. Private to you.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <Field>
          <FieldLabel htmlFor="sleep-cycle-length">Sleep cycle length</FieldLabel>
          <Select
            value={String(sleepCycleLengthMin)}
            onValueChange={(v) => setSleepCycleLength(Number(v))}
          >
            <SelectTrigger id="sleep-cycle-length" disabled={disabled} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {range(70, 110, 5).map((v) => (
                <SelectItem key={v} value={String(v)}>
                  <span className="tabular-nums">{v} minutes</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FieldDescription>
            One full light–deep–REM cycle. 90 minutes fits most adults.
          </FieldDescription>
        </Field>

        <Field>
          <FieldLabel htmlFor="sleep-onset-latency">Time to fall asleep</FieldLabel>
          <Select
            value={String(sleepOnsetLatencyMin)}
            onValueChange={(v) => setSleepOnsetLatency(Number(v))}
          >
            <SelectTrigger id="sleep-onset-latency" disabled={disabled} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {range(0, 60, 5).map((v) => (
                <SelectItem key={v} value={String(v)}>
                  <span className="tabular-nums">{v} minutes</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FieldDescription>
            Added between getting into bed and the first cycle.
          </FieldDescription>
        </Field>

        <Field>
          <FieldLabel htmlFor="sleep-target-cycles">Nightly target</FieldLabel>
          <Select
            value={String(targetSleepCycles)}
            onValueChange={(v) => setTargetSleepCycles(Number(v))}
          >
            <SelectTrigger id="sleep-target-cycles" disabled={disabled} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {range(3, 7, 1).map((v) => (
                <SelectItem key={v} value={String(v)}>
                  <span className="tabular-nums">{v} cycles</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FieldDescription>
            With your settings that&apos;s {formatDuration(targetMs)} in bed per
            night.
          </FieldDescription>
        </Field>
      </CardContent>
    </Card>
  );
}
