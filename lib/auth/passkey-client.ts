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
 * Full passkey sign-in: fetch a challenge for the nickname, run the native
 * authentication ceremony, then verify + mint the session server-side. The
 * caller hard-navigates on `{ ok: true }`.
 */
export async function passkeyLogin(nickname: string): Promise<CeremonyResult> {
  const begin = await beginPasskeyLogin(nickname);
  if ("error" in begin) return { error: begin.error };
  let assertion;
  try {
    assertion = await startAuthentication({ optionsJSON: begin.options });
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
