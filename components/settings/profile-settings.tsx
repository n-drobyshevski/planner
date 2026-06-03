"use client";

import * as React from "react";
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
  const [name, setName] = React.useState(initial);
  const [pending, setPending] = React.useState(false);
  const trimmed = name.trim();
  const dirty = trimmed !== initial;

  async function save() {
    if (!dirty || !trimmed) return;
    setPending(true);
    try {
      await onSave(trimmed);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex max-w-md gap-2">
      <Input
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && save()}
        placeholder="Your name"
        aria-label="Display name"
      />
      <Button onClick={save} disabled={pending || !dirty || !trimmed}>
        Save
      </Button>
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

  const [current, setCurrent] = React.useState("");
  const [next, setNext] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);

  const canSubmit =
    !pending &&
    (!needsCurrent || current.length === 8) &&
    (!needsNew || (next.length === 8 && confirm.length === 8));

  async function submit() {
    setError(null);
    if (needsNew && next !== confirm) {
      setError("PINs don't match.");
      return;
    }
    setPending(true);
    try {
      if (needsCurrent && !(await verifyCurrentPin(current))) {
        setError("Incorrect PIN.");
        return;
      }
      const ok = await savePin(mode === "remove" ? null : next);
      if (ok) onClose();
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <ResponsiveDialogBody className="flex flex-col items-center gap-5 py-3">
        {needsCurrent && (
          <PinInput label="Current PIN" value={current} onChange={setCurrent} autoFocus />
        )}
        {needsNew && (
          <>
            <PinInput
              label={mode === "change" ? "New PIN" : "New 8-digit PIN"}
              value={next}
              onChange={setNext}
              autoFocus={!needsCurrent}
            />
            <PinInput label="Confirm PIN" value={confirm} onChange={setConfirm} />
          </>
        )}
        {error && <p className="text-sm text-destructive">{error}</p>}
      </ResponsiveDialogBody>
      <ResponsiveDialogFooter>
        <Button variant="outline" onClick={onClose} disabled={pending}>
          Cancel
        </Button>
        <Button
          onClick={submit}
          disabled={!canSubmit}
          className={mode === "remove" ? "bg-destructive text-white hover:bg-destructive/90" : undefined}
        >
          {pending ? "Saving…" : PIN_COPY[mode].submit}
        </Button>
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
