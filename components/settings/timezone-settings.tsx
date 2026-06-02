"use client";

import { useEffect, useState } from "react";
import { format } from "date-fns";
import { tz } from "@date-fns/tz";
import { Check, ChevronsUpDown, Globe } from "lucide-react";
import { cn } from "@/lib/utils";
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
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from "@/components/ui/command";
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
  const [open, setOpen] = useState(false);
  const triggerLabel =
    value != null
      ? friendly(value)
      : deviceZone
        ? `Device time zone (${friendly(deviceZone)})`
        : "Device time zone";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-label={ariaLabel}
          disabled={disabled}
          className="w-full justify-between font-normal"
        >
          <span className="truncate">{triggerLabel}</span>
          <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-(--radix-popover-trigger-width) p-0"
        align="start"
      >
        <Command>
          <CommandInput placeholder="Search time zones…" />
          <CommandList>
            <CommandEmpty>No time zone found.</CommandEmpty>
            {allowDevice && (
              <CommandGroup heading="Default">
                <CommandItem
                  value={`device ${deviceZone ?? ""}`}
                  onSelect={() => {
                    onSelect(null);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn("mr-2 size-4", value == null ? "opacity-100" : "opacity-0")}
                  />
                  <span className="flex-1">Use device time zone</span>
                  {deviceZone && (
                    <span className="text-xs text-muted-foreground">
                      {friendly(deviceZone)}
                    </span>
                  )}
                </CommandItem>
              </CommandGroup>
            )}
            {suggestions.length > 0 && (
              <CommandGroup heading="In your workspace">
                {suggestions.map((s) => (
                  <CommandItem
                    key={s.zone}
                    value={`${s.label} ${s.zone}`}
                    onSelect={() => {
                      onSelect(s.zone);
                      setOpen(false);
                    }}
                  >
                    <Check
                      className={cn(
                        "mr-2 size-4",
                        value === s.zone ? "opacity-100" : "opacity-0",
                      )}
                    />
                    <span className="flex-1 truncate">{s.label}</span>
                    <span className="text-xs text-muted-foreground">
                      {friendly(s.zone)}
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            <CommandGroup heading="All time zones">
              {ALL_ZONES.map((z) => (
                <CommandItem
                  key={z}
                  value={z}
                  onSelect={() => {
                    onSelect(z);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn("mr-2 size-4", value === z ? "opacity-100" : "opacity-0")}
                  />
                  {friendly(z)}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export function TimezoneSettings() {
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

  const secondaryOn = secondaryTimeZone != null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Time zone</CardTitle>
        <CardDescription>
          The whole calendar shows times in your zone. A shared event stays
          anchored to the same moment, so each person sees it in their own time.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-8">
        {/* Primary zone */}
        <FieldSet>
          <FieldLegend variant="label">Your time zone</FieldLegend>
          <FieldDescription>
            Event times, day boundaries, and the “now” line all render in this
            zone — even when you travel and your device clock changes.
          </FieldDescription>
          <ZoneCombobox
            value={rawTimezone}
            onSelect={setTimezone}
            deviceZone={deviceZone}
            allowDevice
            disabled={disabled}
            ariaLabel="Your time zone"
          />
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Globe className="size-3.5" />
            Currently <LiveZoneTime zone={timeZone} /> in {friendly(timeZone)}
          </p>
        </FieldSet>

        {/* Secondary zone */}
        <FieldSet>
          <div className="flex items-center justify-between gap-4">
            <div>
              <FieldLegend variant="label">Secondary time zone</FieldLegend>
              <FieldDescription>
                Show a second clock alongside the primary in the week and day
                views — handy for a partner in another zone.
              </FieldDescription>
            </div>
            <Switch
              checked={secondaryOn}
              disabled={disabled}
              aria-label="Show a secondary time zone"
              onCheckedChange={(on) =>
                setSecondaryTimezone(
                  on ? (suggestions[0]?.zone ?? deviceZone ?? "UTC") : null,
                )
              }
            />
          </div>
          {secondaryOn && (
            <>
              <ZoneCombobox
                value={secondaryTimeZone}
                onSelect={(z) => setSecondaryTimezone(z ?? null)}
                deviceZone={deviceZone}
                suggestions={suggestions}
                disabled={disabled}
                ariaLabel="Secondary time zone"
              />
              {secondaryTimeZone && (
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Globe className="size-3.5" />
                  Currently <LiveZoneTime zone={secondaryTimeZone} /> in{" "}
                  {friendly(secondaryTimeZone)}
                </p>
              )}
            </>
          )}
        </FieldSet>
      </CardContent>
    </Card>
  );
}
