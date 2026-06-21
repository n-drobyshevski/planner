"use client";

import {
  startAuthentication,
  startRegistration,
  browserSupportsWebAuthn,
  browserSupportsWebAuthnAutofill,
} from "@simplewebauthn/browser";
import {
  beginPasskeyLogin,
  finishPasskeyLogin,
  beginPasskeyEnrollment,
  finishPasskeyEnrollment,
} from "@/app/[locale]/login/actions";

export { browserSupportsWebAuthn, browserSupportsWebAuthnAutofill };

export type CeremonyResult =
  | { ok: true }
  | { cancelled: true }
  | { error: string };

/** True when the browser threw because the user dismissed the native prompt. */
function isCancel(e: unknown): boolean {
  return e instanceof Error && (e.name === "NotAllowedError" || e.name === "AbortError");
}

/**
 * The shared usernameless sign-in body: fetch a discoverable-credential
 * challenge, run the native ceremony, then verify + resolve the member + mint
 * the session server-side. With `useBrowserAutofill` the request runs as a
 * conditional (autofill) ceremony — the browser surfaces saved passkeys inline
 * on the focused login field instead of opening a modal picker.
 */
async function runPasskeyLogin(useBrowserAutofill: boolean): Promise<CeremonyResult> {
  const { options } = await beginPasskeyLogin();
  let assertion;
  try {
    assertion = await startAuthentication({ optionsJSON: options, useBrowserAutofill });
  } catch (e) {
    if (isCancel(e)) return { cancelled: true };
    return { error: e instanceof Error ? e.message : "passkey error" };
  }
  const fin = await finishPasskeyLogin(assertion);
  return "error" in fin ? { error: fin.error } : { ok: true };
}

/**
 * Explicit (modal) passkey sign-in: the browser shows the saved passkeys and
 * the user picks one. The caller hard-navigates on `{ ok: true }`.
 */
export function passkeyLogin(): Promise<CeremonyResult> {
  return runPasskeyLogin(false);
}

/**
 * Conditional (autofill) passkey sign-in: a background request armed on mount so
 * the browser can offer a saved passkey from the login field's autofill UI. Must
 * fail silently — a user who ignores the suggestion and types a password should
 * never see an error. SimpleWebAuthn's internal abort service cancels this when
 * the explicit button starts a modal ceremony.
 */
export function passkeyAutofill(): Promise<CeremonyResult> {
  return runPasskeyLogin(true);
}

/**
 * Register a new passkey for the signed-in member: fetch creation options, run
 * the native registration ceremony, then persist the credential server-side.
 */
export async function passkeyEnroll(label?: string): Promise<CeremonyResult> {
  const begin = await beginPasskeyEnrollment();
  if ("error" in begin) return { error: begin.error };
  let attestation;
  try {
    attestation = await startRegistration({ optionsJSON: begin.options });
  } catch (e) {
    if (isCancel(e)) return { cancelled: true };
    return { error: e instanceof Error ? e.message : "passkey error" };
  }
  const fin = await finishPasskeyEnrollment(attestation, label);
  return "error" in fin ? { error: fin.error } : { ok: true };
}
