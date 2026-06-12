"use client";

import * as React from "react";
import { useForm } from "@tanstack/react-form";
import { z } from "zod";
import { Check, Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { FieldSet, FieldLegend, FieldDescription } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { SWATCHES } from "@/components/shared/color-swatch-picker";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSeparator,
  InputOTPSlot,
} from "@/components/ui/input-otp";
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
  ResponsiveDialogDescription,
  ResponsiveDialogBody,
  ResponsiveDialogFooter,
} from "@/components/ui/responsive-dialog";
import { useProfile } from "@/lib/hooks/use-profile";

type PinMode = "set" | "change" | "remove";

export function ProfileSettings() {
  const { member, isReady, saveName, saveColor, verifyCurrentPin, savePin } =
    useProfile();
  const [pinMode, setPinMode] = React.useState<PinMode | null>(null);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
          <CardDescription>
            Your name and the PIN used when switching to your profile.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-8">
          {/* Display name */}
          <FieldSet>
            <FieldLegend variant="label">Display name</FieldLegend>
            <FieldDescription>
              Shown on your calendar, your avatar, and when switching profiles.
            </FieldDescription>
            {/* Keyed by member.id so it initialises from the resolved name without a sync effect. */}
            {isReady && member ? (
              <NameField key={member.id} initial={member.name} onSave={saveName} />
            ) : (
              <Input disabled placeholder="Loading…" className="max-w-xs" />
            )}
          </FieldSet>

          {/* Profile color */}
          <FieldSet>
            <FieldLegend variant="label">Profile color</FieldLegend>
            <FieldDescription>
              Tints your avatar and your events on the calendar (unless an event
              sets its own color).
            </FieldDescription>
            {isReady && member ? (
              <ColorPicker value={member.color} onSelect={saveColor} />
            ) : (
              <div className="h-9" />
            )}
          </FieldSet>

          {/* PIN */}
          <FieldSet>
            <FieldLegend variant="label">PIN</FieldLegend>
            <FieldDescription>
              {member?.hasPin
                ? "An 8-digit PIN is required when switching to your profile."
                : "No PIN set — add one to lock your profile when switching."}
            </FieldDescription>
            <div className="flex flex-wrap gap-2">
              {member?.hasPin ? (
                <>
                  <Button variant="outline" disabled={!isReady} onClick={() => setPinMode("change")}>
                    Change PIN
                  </Button>
                  <Button variant="ghost" disabled={!isReady} onClick={() => setPinMode("remove")}>
                    Remove PIN
                  </Button>
                </>
              ) : (
                <Button disabled={!isReady} onClick={() => setPinMode("set")}>
                  Set PIN
                </Button>
              )}
            </div>
          </FieldSet>
        </CardContent>
      </Card>

      <PinDialog
        mode={pinMode}
        onClose={() => setPinMode(null)}
        verifyCurrentPin={verifyCurrentPin}
        savePin={savePin}
      />
    </div>
  );
}

/** Name input + Save, prefilled from the resolved member (mount-time state). */
function NameField({
  initial,
  onSave,
}: {
  initial: string;
  onSave: (name: string) => Promise<boolean>;
}) {
  const form = useForm({
    defaultValues: { name: initial },
    onSubmit: async ({ value }) => {
      const trimmed = value.name.trim();
      if (trimmed === initial || !trimmed) return;
      await onSave(trimmed);
    },
  });

  return (
    <div className="flex max-w-md gap-2">
      <form.Field name="name">
        {(field) => (
          <Input
            value={field.state.value}
            onChange={(e) => field.handleChange(e.target.value)}
            onBlur={field.handleBlur}
            onKeyDown={(e) => e.key === "Enter" && void form.handleSubmit()}
            placeholder="Your name"
            aria-label="Display name"
          />
        )}
      </form.Field>
      <form.Subscribe
        selector={(s) => [s.isSubmitting, s.values.name.trim()] as const}
      >
        {([isSubmitting, trimmed]) => (
          <Button
            onClick={() => void form.handleSubmit()}
            disabled={isSubmitting || trimmed === initial || !trimmed}
          >
            Save
          </Button>
        )}
      </form.Subscribe>
    </div>
  );
}

/**
 * The member's identity color, picked from the shared accent SWATCHES (same set
 * events/tasks use). Unlike the event ColorSwatchPicker there's no "Default" —
 * a member always has a color. Dots render from `var(--swatch-<id>)` so they
 * re-tint with the active palette, matching the resolved calendar colors.
 */
function ColorPicker({
  value,
  onSelect,
}: {
  value: string;
  onSelect: (color: string) => void;
}) {
  return (
    <div role="radiogroup" aria-label="Profile color" className="flex flex-wrap gap-3">
      {SWATCHES.map((s) => {
        const selected = value.toLowerCase() === s.value.toLowerCase();
        return (
          <button
            key={s.id}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={s.label}
            title={s.label}
            onClick={() => onSelect(s.value)}
            className={cn(
              "relative grid size-9 place-items-center rounded-full ring-2 ring-offset-2 ring-offset-background transition-transform outline-none focus-visible:ring-ring active:scale-95",
              selected ? "ring-foreground" : "ring-transparent hover:ring-border",
            )}
            style={{ backgroundColor: `var(--swatch-${s.id})` }}
          >
            {selected && (
              <Check
                className="size-4 drop-shadow-sm"
                style={{ color: `var(--swatch-ink-${s.id}, var(--swatch-ink))` }}
                aria-hidden
              />
            )}
          </button>
        );
      })}
    </div>
  );
}

const PIN_COPY: Record<PinMode, { title: string; description: string; submit: string }> = {
  set: {
    title: "Set PIN",
    description: "Choose an 8-digit PIN to require when switching to your profile.",
    submit: "Set PIN",
  },
  change: {
    title: "Change PIN",
    description: "Enter your current PIN, then choose a new one.",
    submit: "Change PIN",
  },
  remove: {
    title: "Remove PIN",
    description: "Enter your current PIN to remove it. Your profile won't be locked.",
    submit: "Remove PIN",
  },
};

function PinDialog({
  mode,
  onClose,
  verifyCurrentPin,
  savePin,
}: {
  mode: PinMode | null;
  onClose: () => void;
  verifyCurrentPin: (pin: string) => Promise<boolean>;
  savePin: (pin: string | null) => Promise<boolean>;
}) {
  return (
    <ResponsiveDialog open={mode !== null} onOpenChange={(o) => !o && onClose()}>
      <ResponsiveDialogContent>
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle>{mode ? PIN_COPY[mode].title : ""}</ResponsiveDialogTitle>
          <ResponsiveDialogDescription>
            {mode ? PIN_COPY[mode].description : ""}
          </ResponsiveDialogDescription>
        </ResponsiveDialogHeader>
        {/* Remounts per open (Radix unmounts closed content), so fields reset. */}
        {mode && (
          <PinForm
            mode={mode}
            verifyCurrentPin={verifyCurrentPin}
            savePin={savePin}
            onClose={onClose}
          />
        )}
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}

/** New/confirm coupling lives in the schema; PIN lengths gate the button. */
function pinFormSchema(mode: PinMode) {
  const needsNew = mode === "set" || mode === "change";
  return z
    .object({
      current: z.string(),
      next: z.string(),
      confirm: z.string(),
    })
    .superRefine((v, ctx) => {
      if (needsNew && v.next !== v.confirm) {
        ctx.addIssue({
          code: "custom",
          path: ["confirm"],
          message: "PINs don't match.",
        });
      }
    });
}

function PinForm({
  mode,
  verifyCurrentPin,
  savePin,
  onClose,
}: {
  mode: PinMode;
  verifyCurrentPin: (pin: string) => Promise<boolean>;
  savePin: (pin: string | null) => Promise<boolean>;
  onClose: () => void;
}) {
  const needsCurrent = mode === "change" || mode === "remove";
  const needsNew = mode === "set" || mode === "change";

  // Failures the schema can't know about (wrong current PIN, server error).
  const [error, setError] = React.useState<string | null>(null);

  const form = useForm({
    defaultValues: { current: "", next: "", confirm: "" },
    validators: { onSubmit: pinFormSchema(mode) },
    onSubmit: async ({ value }) => {
      setError(null);
      if (needsCurrent && !(await verifyCurrentPin(value.current))) {
        setError("Incorrect PIN.");
        return;
      }
      const ok = await savePin(mode === "remove" ? null : value.next);
      if (ok) onClose();
    },
  });

  return (
    <>
      <ResponsiveDialogBody className="flex flex-col items-center gap-5 py-3">
        {needsCurrent && (
          <form.Field name="current">
            {(field) => (
              <PinInput
                label="Current PIN"
                value={field.state.value}
                onChange={field.handleChange}
                autoFocus
              />
            )}
          </form.Field>
        )}
        {needsNew && (
          <>
            <form.Field name="next">
              {(field) => (
                <PinInput
                  label={mode === "change" ? "New PIN" : "New 8-digit PIN"}
                  value={field.state.value}
                  onChange={field.handleChange}
                  autoFocus={!needsCurrent}
                />
              )}
            </form.Field>
            <form.Field name="confirm">
              {(field) => (
                <PinInput
                  label="Confirm PIN"
                  value={field.state.value}
                  onChange={field.handleChange}
                />
              )}
            </form.Field>
          </>
        )}
        <form.Subscribe selector={(s) => s.fieldMeta.confirm?.errors}>
          {(errors) => {
            const message = error ?? errors?.[0]?.message;
            return message ? (
              <p role="alert" className="text-sm text-destructive">
                {message}
              </p>
            ) : null;
          }}
        </form.Subscribe>
      </ResponsiveDialogBody>
      <ResponsiveDialogFooter>
        <form.Subscribe
          selector={(s) => [s.isSubmitting, s.values] as const}
        >
          {([isSubmitting, values]) => {
            const canSubmit =
              !isSubmitting &&
              (!needsCurrent || values.current.length === 8) &&
              (!needsNew ||
                (values.next.length === 8 && values.confirm.length === 8));
            return (
              <>
                <Button variant="outline" onClick={onClose} disabled={isSubmitting}>
                  Cancel
                </Button>
                <Button
                  onClick={() => void form.handleSubmit()}
                  disabled={!canSubmit}
                  className={
                    mode === "remove"
                      ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      : undefined
                  }
                >
                  {isSubmitting ? "Saving…" : PIN_COPY[mode].submit}
                </Button>
              </>
            );
          }}
        </form.Subscribe>
      </ResponsiveDialogFooter>
    </>
  );
}

function PinInput({
  label,
  value,
  onChange,
  autoFocus,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  autoFocus?: boolean;
}) {
  const [show, setShow] = React.useState(false);
  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        <button
          type="button"
          onClick={() => setShow((s) => !s)}
          className="flex items-center rounded text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={show ? `Hide ${label}` : `Show ${label}`}
          aria-pressed={show}
        >
          {show ? (
            <EyeOff className="size-3.5" aria-hidden />
          ) : (
            <Eye className="size-3.5" aria-hidden />
          )}
        </button>
      </div>
      <InputOTP maxLength={8} value={value} onChange={onChange} autoFocus={autoFocus}>
        <InputOTPGroup>
          <InputOTPSlot index={0} mask={!show} />
          <InputOTPSlot index={1} mask={!show} />
          <InputOTPSlot index={2} mask={!show} />
          <InputOTPSlot index={3} mask={!show} />
        </InputOTPGroup>
        <InputOTPSeparator />
        <InputOTPGroup>
          <InputOTPSlot index={4} mask={!show} />
          <InputOTPSlot index={5} mask={!show} />
          <InputOTPSlot index={6} mask={!show} />
          <InputOTPSlot index={7} mask={!show} />
        </InputOTPGroup>
      </InputOTP>
    </div>
  );
}
