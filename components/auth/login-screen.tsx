"use client";

import { useMemo, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useForm } from "@tanstack/react-form";
import { z } from "zod";
import { toast } from "sonner";
import { Eye, EyeOff } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSeparator,
  InputOTPSlot,
} from "@/components/ui/input-otp";
import { signIn } from "@/app/[locale]/login/actions";

/**
 * Nickname + PIN sign-in. The member is found by name; their PIN (when set) is
 * verified server-side before the session is established. On success the action
 * redirects, so a returned value only ever signals failure.
 */
export function LoginScreen() {
  const t = useTranslations("auth");
  const tv = useTranslations("validation");
  const [showPin, setShowPin] = useState(false);
  // The transition keeps `pending` true through the post-sign-in redirect,
  // which the form's own isSubmitting wouldn't cover.
  const [pending, startTransition] = useTransition();

  // Built inside the component so validation messages can read the catalog.
  const loginFormSchema = useMemo(
    () =>
      z.object({
        name: z.string().trim().min(1, tv("nameRequired")),
        // Blank = no PIN set; otherwise the full 8 digits (verified server-side).
        pin: z.literal("").or(z.string().length(8, tv("pinLength"))),
      }),
    [tv],
  );

  const form = useForm({
    defaultValues: { name: "", pin: "" },
    validators: { onSubmit: loginFormSchema },
    onSubmit: ({ value }) => {
      if (pending) return;
      startTransition(async () => {
        const res = await signIn(value.name.trim(), value.pin);
        if (res && "error" in res) toast.error(res.error);
      });
    },
  });

  return (
    <Card className="w-full max-w-sm shadow-soft">
      <CardContent className="p-6">
        <form
          className="flex flex-col gap-5"
          onSubmit={(e) => {
            e.preventDefault();
            void form.handleSubmit();
          }}
        >
          <form.Field name="name">
            {(field) => {
              const isInvalid =
                field.state.meta.isTouched && !field.state.meta.isValid;
              return (
                <Field data-invalid={isInvalid || undefined}>
                  <FieldLabel htmlFor="login-name">{t("nameLabel")}</FieldLabel>
                  <Input
                    id="login-name"
                    name={field.name}
                    value={field.state.value}
                    onChange={(e) => field.handleChange(e.target.value)}
                    onBlur={field.handleBlur}
                    placeholder={t("namePlaceholder")}
                    autoFocus
                    autoComplete="username"
                    aria-label={t("nameLabel")}
                    aria-invalid={isInvalid || undefined}
                  />
                  {isInvalid && <FieldError errors={field.state.meta.errors} />}
                </Field>
              );
            }}
          </form.Field>

          <form.Field name="pin">
            {(field) => {
              const isInvalid =
                field.state.meta.isTouched && !field.state.meta.isValid;
              return (
                <div className="flex flex-col items-center gap-1.5">
                  <div className="flex w-full items-center justify-between">
                    <span className="text-sm font-medium">{t("pinLabel")}</span>
                    <button
                      type="button"
                      onClick={() => setShowPin((s) => !s)}
                      className="flex items-center gap-1 rounded text-xs text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                      aria-label={showPin ? t("hidePinLabel") : t("showPinLabel")}
                      aria-pressed={showPin}
                    >
                      {showPin ? (
                        <EyeOff className="size-4" aria-hidden />
                      ) : (
                        <Eye className="size-4" aria-hidden />
                      )}
                      {showPin ? t("hidePin") : t("showPin")}
                    </button>
                  </div>
                  <InputOTP
                    maxLength={8}
                    value={field.state.value}
                    onChange={field.handleChange}
                    disabled={pending}
                    containerClassName="self-start"
                  >
                    <InputOTPGroup>
                      <InputOTPSlot index={0} mask={!showPin} />
                      <InputOTPSlot index={1} mask={!showPin} />
                      <InputOTPSlot index={2} mask={!showPin} />
                      <InputOTPSlot index={3} mask={!showPin} />
                    </InputOTPGroup>
                    <InputOTPSeparator />
                    <InputOTPGroup>
                      <InputOTPSlot index={4} mask={!showPin} />
                      <InputOTPSlot index={5} mask={!showPin} />
                      <InputOTPSlot index={6} mask={!showPin} />
                      <InputOTPSlot index={7} mask={!showPin} />
                    </InputOTPGroup>
                  </InputOTP>
                  {isInvalid ? (
                    <FieldError
                      className="self-start"
                      errors={field.state.meta.errors}
                    />
                  ) : (
                    <span className="self-start text-xs text-muted-foreground">
                      {t("pinHint")}
                    </span>
                  )}
                </div>
              );
            }}
          </form.Field>

          <form.Subscribe selector={(s) => s.values.name}>
            {(name) => (
              <Button type="submit" disabled={pending || !name.trim()}>
                {pending ? t("signingIn") : t("signIn")}
              </Button>
            )}
          </form.Subscribe>
        </form>
      </CardContent>
    </Card>
  );
}
