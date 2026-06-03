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
  Field,
  FieldContent,
  FieldLabel,
  FieldSet,
  FieldLegend,
  FieldDescription,
} from "@/components/ui/field";
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { usePreferences } from "@/lib/hooks/use-preferences";
import { ACCENTS, PALETTES, TONES } from "@/lib/theme/appearance";
import type { ContextLabel, ThemePreference } from "@/lib/types";

const CONTEXT_LABEL_OPTIONS = [
  { value: "bar", label: "Title bar" },
  { value: "side", label: "Side label" },
] as const;

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
  const {
    themePreference,
    accent,
    tone,
    palette,
    showInactiveInMonth,
    showSuccessToasts,
    contextLabel,
    setThemePref,
    setAccent,
    setTone,
    setPalette,
    setShowInactiveInMonth,
    setShowSuccessToasts,
    setContextLabel,
    isReady,
  } = usePreferences();

  // Controls stay disabled until the signed-in member resolves. `isReady` is
  // false on both the server and the first client render, so no hydration drift.
  const disabled = !isReady;
  // A Catppuccin flavor owns light/dark + surfaces, so those controls lock while
  // one is active; the accent picker stays live (it maps into the flavor).
  const catppuccin = palette !== "default";

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
          {/* Color palette */}
          <FieldSet>
            <FieldLegend variant="label">Color palette</FieldLegend>
            <FieldDescription>
              Pick the warm default or a Catppuccin flavor. A flavor restyles the
              whole app and sets its own light or dark mode.
            </FieldDescription>
            <div
              role="radiogroup"
              aria-label="Color palette"
              className="grid grid-cols-2 gap-3 sm:grid-cols-3"
            >
              {PALETTES.map((p) => {
                const selected = palette === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    aria-label={p.label}
                    disabled={disabled}
                    onClick={() => setPalette(p.id)}
                    className={cn(
                      "flex flex-col gap-2 rounded-lg border-2 p-3 text-left transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
                      selected
                        ? "border-primary"
                        : "border-border hover:border-foreground/30",
                    )}
                  >
                    <span className="flex gap-1" aria-hidden>
                      {p.swatches.map((c, i) => (
                        <span
                          key={i}
                          className="size-5 rounded-full ring-1 ring-foreground/10"
                          style={{ backgroundColor: c }}
                        />
                      ))}
                    </span>
                    <span className="flex items-center justify-between gap-1">
                      <span className="text-sm font-medium text-foreground">
                        {p.label}
                      </span>
                      {selected && (
                        <Check className="size-4 shrink-0 text-primary" aria-hidden />
                      )}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {p.description}
                    </span>
                  </button>
                );
              })}
            </div>
          </FieldSet>

          {/* Theme */}
          <FieldSet>
            <FieldLegend variant="label">Theme</FieldLegend>
            <FieldDescription>
              {catppuccin
                ? "The Catppuccin flavor sets light or dark."
                : "Match your system, or always use light or dark."}
            </FieldDescription>
            <ToggleGroup
              type="single"
              variant="outline"
              value={themePreference}
              onValueChange={(v) => v && setThemePref(v as ThemePreference)}
              disabled={disabled || catppuccin}
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
              {catppuccin
                ? "Used for buttons, highlights, and focus rings — shown in the active flavor's palette."
                : "Used for buttons, highlights, links, and focus rings."}
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
                    style={{ backgroundColor: `var(--swatch-${a.id})` }}
                  >
                    {selected && (
                      <Check
                        className="size-5 drop-shadow-sm"
                        style={{ color: `var(--swatch-ink-${a.id}, var(--swatch-ink))` }}
                        aria-hidden
                      />
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
              {catppuccin
                ? "Catppuccin defines its own surfaces."
                : "The temperature of backgrounds and borders behind your content."}
            </FieldDescription>
            <ToggleGroup
              type="single"
              variant="outline"
              value={tone}
              onValueChange={(v) => v && setTone(v as (typeof TONES)[number]["id"])}
              disabled={disabled || catppuccin}
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

      {/* Calendar display */}
      <Card>
        <CardHeader>
          <CardTitle>Calendar</CardTitle>
          <CardDescription>
            How your calendar reads. These also follow you across devices.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-8">
          <Field orientation="horizontal">
            <FieldContent>
              <FieldLabel htmlFor="show-inactive-month">
                Show inactive events in month view
              </FieldLabel>
              <FieldDescription>
                Inactive events (like sleep) show grayed out. Turn off to hide
                them in the cramped month grid — week and day always show them.
              </FieldDescription>
            </FieldContent>
            <Switch
              id="show-inactive-month"
              checked={showInactiveInMonth}
              onCheckedChange={setShowInactiveInMonth}
              disabled={disabled}
            />
          </Field>

          {/* Context label variant (week/day grid) */}
          <FieldSet>
            <FieldLegend variant="label">Context label</FieldLegend>
            <FieldDescription>
              How a context block is labelled in the week and day grids: a title
              bar across the top, or a vertical label down the right edge.
            </FieldDescription>
            <ToggleGroup
              type="single"
              variant="outline"
              value={contextLabel}
              onValueChange={(v) => v && setContextLabel(v as ContextLabel)}
              disabled={disabled}
              aria-label="Context label"
            >
              {CONTEXT_LABEL_OPTIONS.map(({ value, label }) => (
                <ToggleGroupItem
                  key={value}
                  value={value}
                  aria-label={label}
                  className={SELECTED_SEGMENT}
                >
                  {label}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </FieldSet>

          {/* Success toasts (confirmation pop-ups) */}
          <Field orientation="horizontal">
            <FieldContent>
              <FieldLabel htmlFor="show-success-toasts">
                Show success notifications
              </FieldLabel>
              <FieldDescription>
                Brief confirmations after an action (like “Task created”). Turn
                off to mute them — errors and warnings always show.
              </FieldDescription>
            </FieldContent>
            <Switch
              id="show-success-toasts"
              checked={showSuccessToasts}
              onCheckedChange={setShowSuccessToasts}
              disabled={disabled}
            />
          </Field>
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
