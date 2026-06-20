/**
 * AAGUID → passkey provider name. The AAGUID is a 128-bit id the authenticator
 * reports at registration that identifies its model/vendor, so it's the most
 * recognizable way to label a credential ("iCloud Keychain", "Windows Hello",
 * "1Password"). Curated subset of the common providers; unknown or all-zeros
 * AAGUIDs (some authenticators report zeros for privacy) fall back to a generic
 * name derived from the synced/device-bound signals.
 *
 * Source of ids: the community passkey-authenticator-aaguids dataset.
 */
const AAGUID_NAMES: Record<string, string> = {
  "ea9b8d66-4d01-1d21-3ce4-b6b48cb575d4": "Google Password Manager",
  "adce0002-35bc-c60a-648b-0b25f1f05503": "Chrome on Mac",
  "fbfc3007-154e-4ecc-8c0b-6e020557d7bd": "iCloud Keychain",
  "08987058-cadc-4b81-b6e1-30de50dcbe96": "Windows Hello",
  "9ddd1817-af5a-4672-a2b9-3e3dd95000a7": "Windows Hello",
  "6028b017-b1d4-4c02-b4b3-afcdafc96bb2": "Windows Hello",
  "dd4ec289-e01d-41c9-bb89-70fa845d4bf2": "iCloud Keychain (Managed)",
  "bada5566-a7aa-401f-bd96-45619a55120d": "1Password",
  "d548826e-79b4-db40-a3d8-11116f7e8349": "Bitwarden",
  "531126d6-e717-415c-9320-3d9aa6981239": "Dashlane",
  "0ea242b4-43c4-4a1b-8b17-dd6d0b6baec6": "Keeper",
  "f3809540-7f14-49c1-a8b3-8f813b225541": "Enpass",
  "b84e4048-15dc-4dd0-8640-f4f60813c8af": "NordPass",
  "fdb141b2-5d84-443e-8a35-4698c205a502": "KeePassXC",
  "53414d53-554e-4700-0000-000000000000": "Samsung Pass",
  "cc45f64e-52a2-451b-831a-4edd8022a202": "ToothPic",
};

const ZERO_AAGUID = "00000000-0000-0000-0000-000000000000";

/**
 * Resolve a human label for a passkey. Prefers the known provider name; otherwise
 * describes the credential by its sync/binding nature so the row is never blank.
 */
export function resolveProvider(
  aaguid: string | null | undefined,
  opts: { deviceType?: string | null; backedUp?: boolean | null } = {},
): string {
  if (aaguid && aaguid !== ZERO_AAGUID) {
    const known = AAGUID_NAMES[aaguid.toLowerCase()];
    if (known) return known;
  }
  if (opts.backedUp || opts.deviceType === "multiDevice") return "Synced passkey";
  if (opts.deviceType === "singleDevice") return "Device passkey";
  return "Passkey";
}
