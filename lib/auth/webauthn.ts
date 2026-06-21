import "server-only";

import { headers } from "next/headers";
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
  type VerifiedRegistrationResponse,
  type VerifiedAuthenticationResponse,
} from "@simplewebauthn/server";
import type {
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
  RegistrationResponseJSON,
  AuthenticationResponseJSON,
} from "@simplewebauthn/server";

const RP_NAME = "Planner";

// User-verification stance (deliberate, reviewed 2026-06): UV is "preferred" on
// both ceremonies and not required on verify. This is a consumer planner for two
// people, and the security property we rely on is passkey *possession* +
// phishing-resistance; the session is additionally bridged behind a per-member
// secret. Mandating UV ("required") would reject otherwise-valid authenticators
// that can't or won't gesture (some cross-device/older platform authenticators)
// for marginal benefit here. Revisit to "required" if the threat model changes
// (e.g. shared devices or sensitive data added).

/**
 * Derive the WebAuthn relying party from the incoming request. rpID is the
 * registrable domain (host without port) and origin is the full scheme+host the
 * browser will report. Works for localhost dev and the deployed domain without
 * extra config; override with WEBAUTHN_RP_ID / WEBAUTHN_ORIGIN if a request is
 * served behind a proxy that rewrites Host.
 */
export async function getRelyingParty(): Promise<{
  rpID: string;
  origin: string;
}> {
  const envRpId = process.env.WEBAUTHN_RP_ID;
  const envOrigin = process.env.WEBAUTHN_ORIGIN;
  if (envRpId && envOrigin) return { rpID: envRpId, origin: envOrigin };

  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost";
  const proto = h.get("x-forwarded-proto") ?? "https";
  const rpID = host.split(":")[0];
  const origin = `${proto}://${host}`;
  return { rpID: envRpId ?? rpID, origin: envOrigin ?? origin };
}

/** Stored credential shape passed to the authentication verifier. */
export type StoredCredential = {
  credential_id: string; // base64url
  public_key: string; // base64url COSE key
  counter: number;
  transports: string[] | null;
};

export async function buildRegistrationOptions(opts: {
  memberId: string;
  memberName: string;
  existing: { credential_id: string; transports: string[] | null }[];
}): Promise<PublicKeyCredentialCreationOptionsJSON> {
  const { rpID } = await getRelyingParty();
  return generateRegistrationOptions({
    rpName: RP_NAME,
    rpID,
    // userID must be stable per member so re-registration replaces, not duplicates.
    userID: new TextEncoder().encode(opts.memberId),
    userName: opts.memberName,
    attestationType: "none",
    excludeCredentials: opts.existing.map((c) => ({
      id: c.credential_id,
      transports: (c.transports ?? undefined) as never,
    })),
    authenticatorSelection: {
      // Required so the credential is discoverable — usernameless login depends on it.
      residentKey: "required",
      userVerification: "preferred",
    },
  });
}

export async function verifyRegistration(opts: {
  response: RegistrationResponseJSON;
  expectedChallenge: string;
}): Promise<VerifiedRegistrationResponse> {
  const { rpID, origin } = await getRelyingParty();
  return verifyRegistrationResponse({
    response: opts.response,
    expectedChallenge: opts.expectedChallenge,
    expectedOrigin: origin,
    expectedRPID: rpID,
    requireUserVerification: false,
  });
}

export async function buildAuthenticationOptions(opts?: {
  allow?: { credential_id: string; transports: string[] | null }[];
}): Promise<PublicKeyCredentialRequestOptionsJSON> {
  const { rpID } = await getRelyingParty();
  // Omitting allowCredentials triggers the discoverable-credential (usernameless)
  // flow: the browser shows every passkey registered for this RP and the user picks.
  const allow = opts?.allow;
  return generateAuthenticationOptions({
    rpID,
    userVerification: "preferred",
    allowCredentials:
      allow && allow.length > 0
        ? allow.map((c) => ({
            id: c.credential_id,
            transports: (c.transports ?? undefined) as never,
          }))
        : undefined,
  });
}

export async function verifyAuthentication(opts: {
  response: AuthenticationResponseJSON;
  expectedChallenge: string;
  credential: StoredCredential;
}): Promise<VerifiedAuthenticationResponse> {
  const { rpID, origin } = await getRelyingParty();
  return verifyAuthenticationResponse({
    response: opts.response,
    expectedChallenge: opts.expectedChallenge,
    expectedOrigin: origin,
    expectedRPID: rpID,
    requireUserVerification: false,
    credential: {
      id: opts.credential.credential_id,
      publicKey: Buffer.from(opts.credential.public_key, "base64url"),
      counter: opts.credential.counter,
      transports: (opts.credential.transports ?? undefined) as never,
    },
  });
}
