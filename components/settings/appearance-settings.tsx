"use client";

import { Check, Monitor, Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  FieldSet,
  FieldLegend,
  FieldDescription,
} from "@/components/ui/field";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { usePreferences } from "@/lib/hooks/use-preferences";
import { ACCENTS, TONES } from "@/lib/theme/appearance";
import type { ThemePreference } from "@/lib/types";

const THEME_OPTIONS = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
] as const;

// Make the active segment legible in every theme/tone (default `bg-muted` is
// invisible when --muted == --card, e.g. neutral/cool dark) by tying it to the accent.
const SELECTED_SEGMENT =
  "data-[state=on]:border-primary data-[state=on]:bg-primary/10 data-[state=on]:text-primary";

export function AppearanceSettings() {
  const { themePreference, accent, tone, setThemePref, setAccent, setTone, isReady } =
    usePreferences();

  // Controls stay disabled until the signed-in member resolves. `isReady` is
  // false on both the server and the first client render, so no hydration drift.
  const disabled = !isReady;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Appearance</CardTitle>
          <CardDescription>
            Personalize how Planner looks. Changes save to your profile and follow
            you across devices.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-8">
          {/* Theme */}
          <FieldSet>
            <FieldLegend variant="label">Theme</FieldLegend>
            <FieldDescription>
              Match your system, or always use light or dark.
            </FieldDescription>
            <ToggleGroup
              type="single"
              variant="outline"
              value={themePreference}
              onValueChange={(v) => v && setThemePref(v as ThemePreference)}
              disabled={disabled}
              aria-label="Theme"
            >
              {THEME_OPTIONS.map(({ value, label, icon: Icon }) => (
                <ToggleGroupItem
                  key={value}
                  value={value}
                  aria-label={label}
                  className={SELECTED_SEGMENT}
                >
                  <Icon data-icon="inline-start" />
                  {label}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </FieldSet>

          {/* Accent color */}
          <FieldSet>
            <FieldLegend variant="label">Accent color</FieldLegend>
            <FieldDescription>
              Used for buttons, highlights, links, and focus rings.
            </FieldDescription>
            <div
              role="radiogroup"
              aria-label="Accent color"
              className="flex flex-wrap gap-3"
            >
              {ACCENTS.map((a) => {
                const selected = accent === a.id;
                return (
                  <button
                    key={a.id}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    aria-label={a.label}
                    title={a.label}
                    disabled={disabled}
                    onClick={() => setAccent(a.id)}
                    className={cn(
                      "relative grid size-11 place-items-center rounded-full ring-2 ring-offset-2 ring-offset-background transition-transform outline-none focus-visible:ring-ring active:scale-95 disabled:cursor-not-allowed disabled:opacity-50",
                      selected ? "ring-foreground" : "ring-transparent hover:ring-border",
                    )}
                    style={{ backgroundColor: a.swatch }}
                  >
                    {selected && (
                      <Check className="size-5 text-white drop-shadow-sm" aria-hidden />
                    )}
                  </button>
                );
              })}
            </div>
          </FieldSet>

          {/* Surface tone */}
          <FieldSet>
            <FieldLegend variant="label">Surface tone</FieldLegend>
            <FieldDescription>
              The temperature of backgrounds and borders behind your content.
            </FieldDescription>
            <ToggleGroup
              type="single"
              variant="outline"
              value={tone}
              onValueChange={(v) => v && setTone(v as (typeof TONES)[number]["id"])}
              disabled={disabled}
              aria-label="Surface tone"
            >
              {TONES.map((t) => (
                <ToggleGroupItem
                  key={t.id}
                  value={t.id}
                  aria-label={t.label}
                  className={SELECTED_SEGMENT}
                >
                  <span
                    data-icon="inline-start"
                    className="size-3 rounded-full ring-1 ring-foreground/15"
                    style={{ backgroundColor: t.swatch }}
                  />
                  {t.label}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </FieldSet>
        </CardContent>
      </Card>

      {/* Live preview */}
      <Card>
        <CardHeader>
          <CardTitle>Preview</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3 rounded-lg border bg-background p-4">
            <p className="font-heading font-medium text-foreground">
              The quick brown fox
            </p>
            <p className="text-sm text-muted-foreground">
              Secondary text sits on the current surface tone.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm">Primary action</Button>
              <Button size="sm" variant="outline">
                Outline
              </Button>
              <span className="rounded-md bg-primary/10 px-2 py-1 text-xs font-medium text-primary">
                Accent chip
              </span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
