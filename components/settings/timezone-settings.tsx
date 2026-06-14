"use client";

import { useEffect, useMemo, useState } from "react";
import { useForm } from "@tanstack/react-form";
import { useTranslations } from "next-intl";
import { format } from "date-fns";
import { tz } from "@date-fns/tz";
import { Globe } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { FieldSet, FieldLegend, FieldDescription } from "@/components/ui/field";
import { Switch } from "@/components/ui/switch";
import {
  Combobox,
  ComboboxCollection,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxGroup,
  ComboboxInput,
  ComboboxItem,
  ComboboxLabel,
  ComboboxList,
  ComboboxTrigger,
} from "@/components/ui/combobox";
import { usePreferences } from "@/lib/hooks/use-preferences";
import { useWorkspace } from "@/lib/hooks/use-workspace";
import { localTimeZone } from "@/lib/datetime/local";

/** All IANA zones the runtime knows; empty on very old engines (graceful). */
const ALL_ZONES: string[] = (() => {
  try {
    const fn = (
      Intl as unknown as { supportedValuesOf?: (key: string) => string[] }
    ).supportedValuesOf;
    return fn ? fn("timeZone") : [];
  } catch {
    return [];
  }
})();

/** "Europe/Berlin" -> "Europe / Berlin" for readability in the list/trigger. */
function friendly(zone: string): string {
  return zone.replace(/_/g, " ").replace(/\//g, " / ");
}

interface ZoneSuggestion {
  zone: string;
  label: string;
}

/** Ticking current-time read-out for a zone. Mount-gated to avoid SSR drift. */
function LiveZoneTime({ zone }: { zone: string }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);
  if (now == null) return null;
  return (
    <span className="tabular-nums">{format(now, "EEE, HH:mm", { in: tz(zone) })}</span>
  );
}

/** One selectable zone; `hint` carries the secondary right-aligned text. */
interface ZoneItem {
  value: string;
  label: string;
  hint?: string;
}

/** Sentinel item value for "use the device's zone" (the stored value is null). */
const DEVICE_VALUE = "__device__";

function ZoneCombobox({
  value,
  onSelect,
  deviceZone,
  allowDevice = false,
  suggestions = [],
  disabled,
  ariaLabel,
}: {
  /** Currently chosen zone, or null for the device default (when allowed). */
  value: string | null;
  onSelect: (zone: string | null) => void;
  deviceZone: string | null;
  allowDevice?: boolean;
  suggestions?: ZoneSuggestion[];
  disabled?: boolean;
  ariaLabel: string;
}) {
  const t = useTranslations("settings");
  const groups = useMemo(() => {
    const out: { label: string; items: ZoneItem[] }[] = [];
    if (allowDevice) {
      out.push({
        label: t("timezone.combobox.defaultGroup"),
        items: [
          {
            value: DEVICE_VALUE,
            label: t("timezone.combobox.useDevice"),
            hint: deviceZone ? friendly(deviceZone) : undefined,
          },
        ],
      });
    }
    if (suggestions.length > 0) {
      out.push({
        label: t("timezone.combobox.workspaceGroup"),
        items: suggestions.map((s) => ({
          value: s.zone,
          label: s.label,
          hint: friendly(s.zone),
        })),
      });
    }
    out.push({
      label: t("timezone.combobox.allGroup"),
      items: ALL_ZONES.map((z) => ({ value: z, label: friendly(z) })),
    });
    return out;
  }, [allowDevice, deviceZone, suggestions, t]);

  // isItemEqualToValue compares by .value, so a synthesized item is fine here.
  const selected: ZoneItem =
    value != null
      ? { value, label: friendly(value) }
      : { value: DEVICE_VALUE, label: t("timezone.combobox.useDevice") };

  const triggerLabel =
    value != null
      ? friendly(value)
      : deviceZone
        ? t("timezone.combobox.deviceTrigger", { zone: friendly(deviceZone) })
        : t("timezone.combobox.deviceTriggerBare");

  return (
    <Combobox
      items={groups}
      value={selected}
      onValueChange={(item: ZoneItem | null) =>
        onSelect(item == null || item.value === DEVICE_VALUE ? null : item.value)
      }
      isItemEqualToValue={(a: ZoneItem, b: ZoneItem) => a?.value === b?.value}
      itemToStringLabel={(item: ZoneItem) => item.label}
      disabled={disabled}
    >
      <ComboboxTrigger
        aria-label={ariaLabel}
        render={
          <Button
            variant="outline"
            disabled={disabled}
            className="w-full justify-between font-normal"
          />
        }
      >
        <span className="truncate">{triggerLabel}</span>
      </ComboboxTrigger>
      <ComboboxContent>
        <ComboboxInput
          placeholder={t("timezone.combobox.searchPlaceholder")}
          showTrigger={false}
          className="w-full"
        />
        <ComboboxEmpty>{t("timezone.combobox.empty")}</ComboboxEmpty>
        <ComboboxList>
          {(group: { label: string; items: ZoneItem[] }) => (
            <ComboboxGroup key={group.label} items={group.items}>
              <ComboboxLabel>{group.label}</ComboboxLabel>
              <ComboboxCollection>
                {(item: ZoneItem) => (
                  <ComboboxItem key={item.value} value={item}>
                    <span className="min-w-0 flex-1 truncate">{item.label}</span>
                    {item.hint && (
                      <span className="text-xs text-muted-foreground">{item.hint}</span>
                    )}
                  </ComboboxItem>
                )}
              </ComboboxCollection>
            </ComboboxGroup>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}

export function TimezoneSettings() {
  const t = useTranslations("settings");
  const {
    rawTimezone,
    timeZone,
    secondaryTimeZone,
    setTimezone,
    setSecondaryTimezone,
    isReady,
  } = usePreferences();
  const workspace = useWorkspace();
  const disabled = !isReady;

  // Device zone is read on the client only (mount-gated) so the trigger label
  // never differs between the server and the first client render.
  const [deviceZone, setDeviceZone] = useState<string | null>(null);
  useEffect(() => setDeviceZone(localTimeZone()), []);

  // Other members who set an explicit zone — handy "see their time" suggestions.
  const currentId = workspace.data?.currentMember?.id;
  const seen = new Set<string>();
  const suggestions: ZoneSuggestion[] = [];
  for (const m of workspace.data?.members ?? []) {
    if (m.id === currentId || m.timezone == null || seen.has(m.timezone)) continue;
    seen.add(m.timezone);
    suggestions.push({ zone: m.timezone, label: m.name });
  }

  // Instant apply: each field's onChange listener writes straight through the
  // preference setter — no Save step. The reset below resyncs after external
  // changes (initial load, another device); identical echoes no-op.
  const form = useForm({
    defaultValues: { primary: rawTimezone, secondary: secondaryTimeZone },
  });

  useEffect(() => {
    form.reset({ primary: rawTimezone, secondary: secondaryTimeZone });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawTimezone, secondaryTimeZone]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("timezone.title")}</CardTitle>
        <CardDescription>{t("timezone.description")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-8">
        {/* Primary zone */}
        <FieldSet>
          <FieldLegend variant="label">{t("timezone.primary.legend")}</FieldLegend>
          <FieldDescription>
            {t("timezone.primary.description")}
          </FieldDescription>
          <form.Field
            name="primary"
            listeners={{ onChange: ({ value }) => setTimezone(value) }}
          >
            {(field) => (
              <ZoneCombobox
                value={field.state.value}
                onSelect={field.handleChange}
                deviceZone={deviceZone}
                allowDevice
                disabled={disabled}
                ariaLabel={t("timezone.primary.ariaLabel")}
              />
            )}
          </form.Field>
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Globe className="size-3.5" />
            {t.rich("timezone.currently", {
              time: () => <LiveZoneTime zone={timeZone} />,
              zone: friendly(timeZone),
            })}
          </p>
        </FieldSet>

        {/* Secondary zone */}
        <FieldSet>
          <form.Field
            name="secondary"
            listeners={{ onChange: ({ value }) => setSecondaryTimezone(value) }}
          >
            {(field) => (
              <>
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <FieldLegend variant="label">{t("timezone.secondary.legend")}</FieldLegend>
                    <FieldDescription>
                      {t("timezone.secondary.description")}
                    </FieldDescription>
                  </div>
                  <Switch
                    checked={field.state.value != null}
                    disabled={disabled}
                    aria-label={t("timezone.secondary.switchAriaLabel")}
                    onCheckedChange={(on) =>
                      field.handleChange(
                        on ? (suggestions[0]?.zone ?? deviceZone ?? "UTC") : null,
                      )
                    }
                  />
                </div>
                {field.state.value != null && (
                  <>
                    <ZoneCombobox
                      value={field.state.value}
                      onSelect={(z) => field.handleChange(z ?? null)}
                      deviceZone={deviceZone}
                      suggestions={suggestions}
                      disabled={disabled}
                      ariaLabel={t("timezone.secondary.ariaLabel")}
                    />
                    <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Globe className="size-3.5" />
                      {t.rich("timezone.currently", {
                        time: () => <LiveZoneTime zone={field.state.value!} />,
                        zone: friendly(field.state.value),
                      })}
                    </p>
                  </>
                )}
              </>
            )}
          </form.Field>
        </FieldSet>
      </CardContent>
    </Card>
  );
}
