import { describe, it, expect, afterEach } from "vitest";
import {
  buildAssetLinks,
  normalizeFingerprint,
  DEFAULT_ANDROID_PACKAGE_NAME,
} from "@/lib/android/asset-links";
import { GET } from "@/app/.well-known/assetlinks.json/route";

const HEX = "14:6D:E9:83:C5:73:06:50:D8:EE:B9:95:2F:34:FC:64:16:A0:83:42:E6:1D:BE:A8:8A:04:96:B2:3F:CF:44:E5";
const HEX2 = "FA:C6:17:45:DC:09:03:78:6F:B9:ED:E6:2A:96:2B:39:9F:73:48:F0:BB:6F:89:9B:83:32:66:75:91:03:3B:9C";

const ENV = { ...process.env };
afterEach(() => {
  process.env = { ...ENV };
});

describe("normalizeFingerprint", () => {
  it("accepts colon-separated and bare hex, upper-casing it", () => {
    expect(normalizeFingerprint(HEX.toLowerCase())).toBe(HEX);
    expect(normalizeFingerprint(` ${HEX.replace(/:/g, "")} `)).toBe(HEX);
  });

  it("rejects wrong lengths and non-hex", () => {
    expect(normalizeFingerprint("")).toBeNull();
    expect(normalizeFingerprint("AB:CD")).toBeNull();
    expect(normalizeFingerprint(HEX.replace("14", "ZZ"))).toBeNull();
  });
});

describe("buildAssetLinks", () => {
  it("is an empty statement list when unconfigured or unusable", () => {
    expect(buildAssetLinks(undefined, undefined)).toEqual([]);
    expect(buildAssetLinks("", "page.planr.android")).toEqual([]);
    expect(buildAssetLinks("not-a-fingerprint", undefined)).toEqual([]);
    expect(buildAssetLinks(HEX, "not a package")).toEqual([]);
  });

  it("declares App Link handling and credential sharing for the default package", () => {
    expect(buildAssetLinks(HEX, undefined)).toEqual([
      {
        relation: [
          "delegate_permission/common.handle_all_urls",
          "delegate_permission/common.get_login_creds",
        ],
        target: {
          namespace: "android_app",
          package_name: DEFAULT_ANDROID_PACKAGE_NAME,
          sha256_cert_fingerprints: [HEX],
        },
      },
    ]);
  });

  it("lists every valid comma-separated fingerprint once, dropping junk", () => {
    const [statement] = buildAssetLinks(`${HEX}, ${HEX2.toLowerCase()},junk,${HEX}`, " page.planr.dev ");
    expect(statement.target.package_name).toBe("page.planr.dev");
    expect(statement.target.sha256_cert_fingerprints).toEqual([HEX, HEX2]);
  });
});

describe("GET /.well-known/assetlinks.json", () => {
  it("serves JSON built from the env", async () => {
    delete process.env.ANDROID_CERT_SHA256;
    let res = GET();
    expect(res.headers.get("content-type")).toContain("application/json");
    expect(await res.json()).toEqual([]);

    process.env.ANDROID_CERT_SHA256 = HEX;
    process.env.ANDROID_PACKAGE_NAME = "page.planr.android";
    res = GET();
    const body = await res.json();
    expect(body[0].target.sha256_cert_fingerprints).toEqual([HEX]);
  });
});
