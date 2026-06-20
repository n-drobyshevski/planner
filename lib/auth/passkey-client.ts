"use client";

import {
  startAuthentication,
  startRegistration,
  browserSupportsWebAuthn,
} from "@simplewebauthn/browser";
import {
  beginPasskeyLogin,
  finishPasskeyLogin,
  beginPasskeyEnrollment,
  finishPasskeyEnrollment,
} from "@/app/[locale]/login/actions";

export { browserSupportsWebAuthn };

type CeremonyResult = { ok: true } | { cancelled: true } | { error: string };

/** True when the browser threw because the user dismissed the native prompt. */
function isCancel(e: unknown): boolean {
  return e instanceof Error && (e.name === "NotAllowedError" || e.name === "AbortError");
}

/**
 * Full passkey sign-in, usernameless: fetch a discoverable-credential challenge,
 * run the native ceremony (the browser shows the saved passkeys and the user
 * picks one), then verify + resolve the member + mint the session server-side.
 * The caller hard-navigates on `{ ok: true }`.
 */
export async function passkeyLogin(): Promise<CeremonyResult> {
  const { options } = await beginPasskeyLogin();
  let assertion;
  try {
    assertion = await startAuthentication({ optionsJSON: options });
  } catch (e) {
    if (isCancel(e)) return { cancelled: true };
    return { error: e instanceof Error ? e.message : "passkey error" };
  }
  const fin = await finishPasskeyLogin(assertion);
  return "error" in fin ? { error: fin.error } : { ok: true };
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
