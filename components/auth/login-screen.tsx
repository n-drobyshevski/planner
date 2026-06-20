"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useForm } from "@tanstack/react-form";
import { z } from "zod";
import { toast } from "sonner";
import { KeyRound } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { PinInput } from "@/components/auth/pin-input";
import { signIn } from "@/app/[locale]/login/actions";
import { passkeyLogin, browserSupportsWebAuthn } from "@/lib/auth/passkey-client";

/**
 * Nickname + PIN sign-in. The member is found by name; their PIN (when set) is
 * verified server-side before the session is established. On success the action
 * redirects, so a returned value only ever signals failure.
 */
export function LoginScreen() {
  const t = useTranslations("auth");
  const tv = useTranslations("validation");
  const locale = useLocale();
  // The transition keeps `pending` true through the post-sign-in redirect,
  // which the form's own isSubmitting wouldn't cover.
  const [pending, startTransition] = useTransition();
  // Passkey sign-in runs its own pending state and only renders when the
  // browser supports WebAuthn (checked client-side to avoid an SSR mismatch).
  const [passkeyPending, setPasskeyPending] = useState(false);
  const [passkeySupported, setPasskeySupported] = useState(false);
  useEffect(() => setPasskeySupported(browserSupportsWebAuthn()), []);

  const runPasskey = () => {
    setPasskeyPending(true);
    // Usernameless: the browser shows the saved passkeys and the user picks one.
    void passkeyLogin().then((res) => {
      if ("ok" in res) {
        // Hard-navigate so per-member React Query caches reset (mirrors switch).
        window.location.assign(`/${locale}/calendar`);
        return;
      }
      setPasskeyPending(false);
      if ("error" in res) toast.error(res.error); // a cancel resolves silently
    });
  };

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
          {passkeySupported && (
            <div className="flex flex-col gap-4">
              <Button
                type="button"
                disabled={passkeyPending || pending}
                onClick={runPasskey}
              >
                <KeyRound className="size-4" aria-hidden />
                {passkeyPending ? t("signingIn") : t("passkeySignIn")}
              </Button>
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span className="h-px flex-1 bg-border" />
                {t("orUseName")}
                <span className="h-px flex-1 bg-border" />
              </div>
            </div>
          )}

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
                  <PinInput
                    value={field.state.value}
                    onChange={field.handleChange}
                    disabled={pending}
                  />
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
              <Button
                type="submit"
                variant={passkeySupported ? "outline" : "default"}
                disabled={pending || !name.trim()}
              >
                {pending ? t("signingIn") : t("signIn")}
              </Button>
            )}
          </form.Subscribe>
        </form>
      </CardContent>
    </Card>
  );
}
