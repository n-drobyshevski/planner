"use client";

import * as React from "react";
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
import {
  InputOTP,
  InputOTPGroup,
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
  const { member, isReady, saveName, verifyCurrentPin, savePin } = useProfile();
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

          {/* PIN */}
          <FieldSet>
            <FieldLegend variant="label">PIN</FieldLegend>
            <FieldDescription>
              {member?.hasPin
                ? "A 4-digit PIN is required when switching to your profile."
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

const PIN_COPY: Record<PinMode, { title: string; description: string; submit: string }> = {
  set: {
    title: "Set PIN",
    description: "Choose a 4-digit PIN to require when switching to your profile.",
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
    (!needsCurrent || current.length === 4) &&
    (!needsNew || (next.length === 4 && confirm.length === 4));

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
              label={mode === "change" ? "New PIN" : "New 4-digit PIN"}
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
  return (
    <div className="flex flex-col items-center gap-1.5">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <InputOTP maxLength={4} value={value} onChange={onChange} autoFocus={autoFocus}>
        <InputOTPGroup>
          <InputOTPSlot index={0} />
          <InputOTPSlot index={1} />
          <InputOTPSlot index={2} />
          <InputOTPSlot index={3} />
        </InputOTPGroup>
      </InputOTP>
    </div>
  );
}
