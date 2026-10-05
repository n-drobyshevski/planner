import { describe, it, expect } from "vitest";
import { buildCallbackIntentUrl } from "@/lib/android/callback-intent";

const HOST = "auth.planr.page";
const PATH = "/app/auth/callback";

describe("buildCallbackIntentUrl", () => {
  it("re-delivers code and state to the app's package over https", () => {
    expect(buildCallbackIntentUrl(HOST, PATH, "?code=abc&state=xyz")).toBe(
      "intent://auth.planr.page/app/auth/callback?code=abc&state=xyz" +
        "#Intent;scheme=https;package=page.planr.android;end",
    );
  });

  it("forwards a denial so the app can show it", () => {
    expect(
      buildCallbackIntentUrl(HOST, PATH, "?error=access_denied&error_description=No&state=s"),
    ).toBe(
      "intent://auth.planr.page/app/auth/callback?state=s&error=access_denied&error_description=No" +
        "#Intent;scheme=https;package=page.planr.android;end",
    );
  });

  it("returns null when there is nothing to finish", () => {
    expect(buildCallbackIntentUrl(HOST, PATH, "")).toBeNull();
    expect(buildCallbackIntentUrl(HOST, PATH, "?state=only")).toBeNull();
    expect(buildCallbackIntentUrl(HOST, PATH, "?code=")).toBeNull();
  });

  it("drops unknown parameters", () => {
    expect(buildCallbackIntentUrl(HOST, PATH, "?code=a&state=b&next=https://evil.example")).toBe(
      "intent://auth.planr.page/app/auth/callback?code=a&state=b" +
        "#Intent;scheme=https;package=page.planr.android;end",
    );
  });

  it("encodes values so they can't break out of the intent URL", () => {
    const url = buildCallbackIntentUrl(
      HOST,
      PATH,
      "?code=" + encodeURIComponent("x#Intent;package=evil.app;end") + "&state=s",
    );
    expect(url).toBe(
      "intent://auth.planr.page/app/auth/callback?code=x%23Intent%3Bpackage%3Devil.app%3Bend&state=s" +
        "#Intent;scheme=https;package=page.planr.android;end",
    );
    expect(url!.match(/#Intent;/g)).toHaveLength(1);
  });

  it("uses a configured package name, falling back on invalid ones", () => {
    expect(buildCallbackIntentUrl(HOST, PATH, "?code=a", "page.planr.staging")).toContain(
      ";package=page.planr.staging;end",
    );
    expect(buildCallbackIntentUrl(HOST, PATH, "?code=a", "evil;end")).toContain(
      ";package=page.planr.android;end",
    );
  });
});
