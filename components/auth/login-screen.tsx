"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useForm } from "@tanstack/react-form";
import { z } from "zod";
import { toast } from "sonner";
import { KeyRound } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/auth/password-input";
import { createClient } from "@/lib/supabase/client";
import { signIn } from "@/app/[locale]/login/actions";
import { safeAuthorizationId, postLoginPath } from "@/lib/auth/oauth-return";
import {
  passkeyLogin,
  passkeyAutofill,
  browserSupportsWebAuthn,
  browserSupportsWebAuthnAutofill,
} from "@/lib/auth/passkey-client";
import { clearPasskeyNudgeDismissals } from "@/lib/auth/passkey-nudge-state";

/**
 * Nickname + password sign-in. The member is found by name; their password (when
 * set) is verified server-side before the session is established. On success the
 * action redirects, so a returned value only ever signals failure.
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

  // The OAuth consent flow bounces unauthenticated users here with an
  // `authorization_id` preserved in the URL; read it (client-side, validated) so
  // we can resume the flow after login instead of dropping the user on /calendar.
  const currentAuthorizationId = () =>
    typeof window === "undefined"
      ? null
      : safeAuthorizationId(
          new URLSearchParams(window.location.search).get("authorization_id"),
        );

  // Hard-navigate so per-member React Query caches reset (mirrors account switch).
  // Returns to the consent screen when resuming OAuth, else the calendar.
  const goAfterLogin = () =>
    window.location.assign(postLoginPath(locale, currentAuthorizationId()));

  // Reaching the login screen means a fresh session is about to start, so reset
  // the "Not now" decisions on the post-login passkey nudge (see passkey-nudge).
  useEffect(() => clearPasskeyNudgeDismissals(), []);

  // The proxy no longer bounces already-authenticated users off the login routes
  // (they're kept off the Supabase gate so they stay edge-static), so guard it
  // here. getClaims is a local verify (no Auth-server roundtrip) and runs after
  // hydration, so the static shell still paints instantly — the redirect only
  // fires for the rare already-signed-in visitor.
  useEffect(() => {
    let cancelled = false;
    void createClient()
      .auth.getClaims()
      .then(({ data }) => {
        if (!cancelled && data?.claims) goAfterLogin();
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Conditional UI: arm a background passkey request on mount so the browser can
  // offer a saved passkey inline from the name field's autofill. It must fail
  // silently — someone who ignores the suggestion and types a password should
  // never see an error. The ref keeps StrictMode's double-invoke from arming it
  // twice; the explicit button below auto-cancels this via SimpleWebAuthn's
  // internal abort service when it starts a modal ceremony.
  const autofillArmed = useRef(false);
  useEffect(() => {
    if (autofillArmed.current) return;
    autofillArmed.current = true;
    void browserSupportsWebAuthnAutofill().then((ok) => {
      if (!ok) return;
      void passkeyAutofill().then((res) => {
        if ("ok" in res) goAfterLogin();
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const runPasskey = () => {
    setPasskeyPending(true);
    // Usernameless: the browser shows the saved passkeys and the user picks one.
    void passkeyLogin().then((res) => {
      if ("ok" in res) {
        goAfterLogin();
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
        // Blank = no password set; otherwise whatever they typed (verified
        // server-side). No length rule here — it would block a shorter stored
        // secret and login isn't where a policy belongs.
        password: z.string(),
      }),
    [tv],
  );

  const form = useForm({
    defaultValues: { name: "", password: "" },
    validators: { onSubmit: loginFormSchema },
    onSubmit: ({ value }) => {
      if (pending) return;
      startTransition(async () => {
        const res = await signIn(
          value.name.trim(),
          value.password,
          currentAuthorizationId() ?? undefined,
        );
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
                    autoComplete="username webauthn"
                    aria-label={t("nameLabel")}
                    aria-invalid={isInvalid || undefined}
                  />
                  {isInvalid && <FieldError errors={field.state.meta.errors} />}
                </Field>
              );
            }}
          </form.Field>

          <form.Field name="password">
            {(field) => {
              const isInvalid =
                field.state.meta.isTouched && !field.state.meta.isValid;
              return (
                <div className="flex flex-col gap-1.5">
                  <PasswordInput
                    id="login-password"
                    name={field.name}
                    label={t("passwordLabel")}
                    value={field.state.value}
                    onChange={field.handleChange}
                    disabled={pending}
                    autoComplete="current-password"
                  />
                  {isInvalid ? (
                    <FieldError errors={field.state.meta.errors} />
                  ) : (
                    <span className="text-xs text-muted-foreground">
                      {t("passwordHint")}
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
