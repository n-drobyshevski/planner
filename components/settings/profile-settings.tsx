"use client";

import * as React from "react";
import { useForm } from "@tanstack/react-form";
import { useLocale, useTranslations } from "next-intl";
import { z } from "zod";
import { Check, Cloud, Eye, EyeOff, KeyRound, Laptop, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { formatDayMonthYear, formatRelativeToNow } from "@/lib/datetime/format";
import { passkeyEnroll, browserSupportsWebAuthn } from "@/lib/auth/passkey-client";
import {
  listPasskeys,
  removePasskey,
  type PasskeySummary,
} from "@/app/[locale]/login/actions";
import { SettingsSection } from "@/components/settings/settings-section";
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
  const t = useTranslations("settings");
  const tCommon = useTranslations("common");
  const { member, isReady, saveName, saveColor, verifyCurrentPin, savePin } =
    useProfile();
  const [pinMode, setPinMode] = React.useState<PinMode | null>(null);

  return (
    <>
      <SettingsSection title={t("profile.title")} description={t("profile.description")}>
        {/* Display name */}
      <FieldSet>
        <FieldLegend variant="label">{t("profile.displayName.legend")}</FieldLegend>
        <FieldDescription>
          {t("profile.displayName.description")}
        </FieldDescription>
        {/* Keyed by member.id so it initialises from the resolved name without a sync effect. */}
        {isReady && member ? (
          <NameField key={member.id} initial={member.name} onSave={saveName} />
        ) : (
          <Input disabled placeholder={tCommon("loading")} className="max-w-xs" />
        )}
      </FieldSet>

      {/* Profile color */}
      <FieldSet>
        <FieldLegend variant="label">{t("profile.color.legend")}</FieldLegend>
        <FieldDescription>
          {t("profile.color.description")}
        </FieldDescription>
        {isReady && member ? (
          <ColorPicker value={member.color} onSelect={saveColor} />
        ) : (
          <div className="h-11" />
        )}
      </FieldSet>

      {/* PIN */}
      <FieldSet>
        <FieldLegend variant="label">{t("profile.pin.legend")}</FieldLegend>
        <FieldDescription>
          {member?.hasPin
            ? t("profile.pin.descriptionSet")
            : t("profile.pin.descriptionUnset")}
        </FieldDescription>
        <div className="flex flex-wrap gap-2">
          {member?.hasPin ? (
            <>
              <Button variant="outline" disabled={!isReady} onClick={() => setPinMode("change")}>
                {t("profile.pin.change")}
              </Button>
              <Button variant="ghost" disabled={!isReady} onClick={() => setPinMode("remove")}>
                {t("profile.pin.remove")}
              </Button>
            </>
          ) : (
            <Button disabled={!isReady} onClick={() => setPinMode("set")}>
              {t("profile.pin.set")}
            </Button>
          )}
        </div>
      </FieldSet>

      {/* Passkeys */}
      <PasskeysSection isReady={isReady} />
      </SettingsSection>

      <PinDialog
        mode={pinMode}
        onClose={() => setPinMode(null)}
        verifyCurrentPin={verifyCurrentPin}
        savePin={savePin}
      />
    </>
  );
}

/**
 * Passkey management for the signed-in member. Passkeys are the primary,
 * phishing-resistant login factor; the PIN above is the fallback. Only renders
 * its controls when the browser supports WebAuthn.
 */
function PasskeysSection({ isReady }: { isReady: boolean }) {
  const t = useTranslations("settings");
  const locale = useLocale();
  const [supported, setSupported] = React.useState(false);
  const [passkeys, setPasskeys] = React.useState<PasskeySummary[] | null>(null);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => setSupported(browserSupportsWebAuthn()), []);
  const refresh = React.useCallback(() => {
    void listPasskeys().then(setPasskeys);
  }, []);
  React.useEffect(() => {
    if (supported) refresh();
  }, [supported, refresh]);

  const add = () => {
    setBusy(true);
    void passkeyEnroll().then((res) => {
      setBusy(false);
      if ("ok" in res) {
        toast.success(t("profile.passkeys.added"));
        refresh();
      } else if ("error" in res) {
        toast.error(res.error);
      }
    });
  };

  const remove = (id: string) => {
    setBusy(true);
    void removePasskey(id).then((res) => {
      setBusy(false);
      if ("error" in res) toast.error(res.error);
      else {
        toast.success(t("profile.passkeys.removed"));
        refresh();
      }
    });
  };

  return (
    <FieldSet>
      <FieldLegend variant="label">{t("profile.passkeys.legend")}</FieldLegend>
      <FieldDescription>
        {supported
          ? t("profile.passkeys.description")
          : t("profile.passkeys.unsupported")}
      </FieldDescription>
      {supported && (
        <div className="flex flex-col gap-3">
          {passkeys && passkeys.length > 0 && (
            <ul className="flex flex-col gap-2">
              {passkeys.map((pk) => {
                const synced =
                  pk.backedUp === true || pk.deviceType === "multiDevice";
                const Icon = synced ? Cloud : pk.deviceType ? Laptop : KeyRound;
                const where =
                  pk.createdBrowser && pk.createdOs
                    ? ` · ${t("profile.passkeys.deviceLine", { browser: pk.createdBrowser, os: pk.createdOs })}`
                    : pk.createdBrowser
                      ? ` · ${pk.createdBrowser}`
                      : pk.createdOs
                        ? ` · ${pk.createdOs}`
                        : "";
                return (
                  <li
                    key={pk.id}
                    className="flex items-start justify-between gap-3 rounded-md border px-3 py-2.5"
                  >
                    <div className="flex min-w-0 items-start gap-3">
                      <Icon
                        className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                        aria-hidden
                      />
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <span className="text-sm font-medium">{pk.provider}</span>
                          {pk.deviceType && (
                            <span className="rounded-full border px-1.5 py-px text-[0.6875rem] font-medium text-muted-foreground">
                              {synced
                                ? t("profile.passkeys.synced")
                                : t("profile.passkeys.thisDevice")}
                            </span>
                          )}
                        </div>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {t("profile.passkeys.addedOn", {
                            date: formatDayMonthYear(
                              new Date(pk.created_at).getTime(),
                              undefined,
                              locale,
                            ),
                          })}
                          {where}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {pk.last_used_at
                            ? t("profile.passkeys.lastUsed", {
                                when: formatRelativeToNow(
                                  new Date(pk.last_used_at).getTime(),
                                  locale,
                                ),
                              })
                            : t("profile.passkeys.neverUsed")}
                        </p>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="shrink-0"
                      disabled={busy}
                      onClick={() => remove(pk.id)}
                      aria-label={t("profile.passkeys.remove")}
                    >
                      <Trash2 className="size-4" aria-hidden />
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
          <div>
            <Button disabled={!isReady || busy} onClick={add}>
              <KeyRound className="size-4" aria-hidden />
              {t("profile.passkeys.add")}
            </Button>
          </div>
        </div>
      )}
    </FieldSet>
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
  const t = useTranslations("settings");
  const tCommon = useTranslations("common");
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
            placeholder={t("profile.displayName.placeholder")}
            aria-label={t("profile.displayName.ariaLabel")}
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
            {tCommon("save")}
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
  const t = useTranslations("settings");
  return (
    <div role="radiogroup" aria-label={t("profile.color.ariaLabel")} className="flex flex-wrap gap-3">
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
              "relative grid size-11 place-items-center rounded-full ring-2 ring-offset-2 ring-offset-background transition-transform outline-none focus-visible:ring-ring active:scale-95",
              selected ? "ring-foreground" : "ring-transparent hover:ring-border",
            )}
            style={{ backgroundColor: `var(--swatch-${s.id})` }}
          >
            {selected && (
              <Check
                className="size-5 drop-shadow-sm"
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
  const t = useTranslations("settings");
  return (
    <ResponsiveDialog open={mode !== null} onOpenChange={(o) => !o && onClose()}>
      <ResponsiveDialogContent>
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle>
            {mode ? t(`profile.pin.dialog.${mode}.title`) : ""}
          </ResponsiveDialogTitle>
          <ResponsiveDialogDescription>
            {mode ? t(`profile.pin.dialog.${mode}.description`) : ""}
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

/** New/confirm coupling lives in the schema; PIN lengths gate the button.
 *  The mismatch message is passed in so the (hook-free) schema stays localizable. */
function pinFormSchema(mode: PinMode, mismatchMessage: string) {
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
          message: mismatchMessage,
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
  const t = useTranslations("settings");
  const tCommon = useTranslations("common");
  const needsCurrent = mode === "change" || mode === "remove";
  const needsNew = mode === "set" || mode === "change";

  // Failures the schema can't know about (wrong current PIN, server error).
  const [error, setError] = React.useState<string | null>(null);

  const form = useForm({
    defaultValues: { current: "", next: "", confirm: "" },
    validators: { onSubmit: pinFormSchema(mode, t("profile.pin.mismatch")) },
    onSubmit: async ({ value }) => {
      setError(null);
      if (needsCurrent && !(await verifyCurrentPin(value.current))) {
        setError(t("profile.pin.incorrect"));
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
                label={t("profile.pin.currentLabel")}
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
                  label={mode === "change" ? t("profile.pin.newLabel") : t("profile.pin.newLabelLong")}
                  value={field.state.value}
                  onChange={field.handleChange}
                  autoFocus={!needsCurrent}
                />
              )}
            </form.Field>
            <form.Field name="confirm">
              {(field) => (
                <PinInput
                  label={t("profile.pin.confirmLabel")}
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
                  {tCommon("cancel")}
                </Button>
                <Button
                  onClick={() => void form.handleSubmit()}
                  disabled={!canSubmit}
                  variant={mode === "remove" ? "destructive" : "default"}
                >
                  {isSubmitting ? tCommon("saving") : t(`profile.pin.dialog.${mode}.submit`)}
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
  const t = useTranslations("settings");
  const [show, setShow] = React.useState(false);
  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        <button
          type="button"
          onClick={() => setShow((s) => !s)}
          className="flex items-center rounded text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={show ? t("profile.pin.hideLabel", { label }) : t("profile.pin.showLabel", { label })}
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
