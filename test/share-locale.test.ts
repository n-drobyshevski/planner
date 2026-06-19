import { describe, it, expect } from "vitest";
import {
  resolveShareLocale,
  SHARE_FALLBACK_LOCALE,
} from "@/lib/i18n/share-locale";

describe("resolveShareLocale", () => {
  it("falls back to Russian when nothing is known", () => {
    expect(resolveShareLocale(undefined, undefined)).toBe("ru");
    expect(resolveShareLocale(null, null)).toBe("ru");
    expect(SHARE_FALLBACK_LOCALE).toBe("ru");
  });

  it("honours an explicit cookie over everything else", () => {
    // Cookie wins even when the browser clearly prefers the other locale.
    expect(resolveShareLocale("en", "ru,ru-RU;q=0.9")).toBe("en");
    expect(resolveShareLocale("ru", "en-US,en;q=0.9")).toBe("ru");
  });

  it("ignores an unsupported cookie value and negotiates instead", () => {
    expect(resolveShareLocale("de", "en-US,en;q=0.9")).toBe("en");
    expect(resolveShareLocale("", "en")).toBe("en");
  });

  it("matches the browser locale by primary subtag", () => {
    expect(resolveShareLocale(undefined, "en-GB")).toBe("en");
    expect(resolveShareLocale(undefined, "ru-RU")).toBe("ru");
    expect(resolveShareLocale(undefined, "en")).toBe("en");
  });

  it("respects quality ordering, not header order", () => {
    // ru is listed first but en outranks it by quality.
    expect(resolveShareLocale(undefined, "ru;q=0.5,en;q=0.9")).toBe("en");
    // Equal quality keeps header order (stable sort): ru appears first.
    expect(resolveShareLocale(undefined, "ru,en")).toBe("ru");
  });

  it("skips unsupported tags and picks the first supported one", () => {
    expect(resolveShareLocale(undefined, "de-DE,fr;q=0.8,en;q=0.7")).toBe("en");
    expect(resolveShareLocale(undefined, "de,ja,ru;q=0.6")).toBe("ru");
  });

  it("falls back to Russian for a non-en/non-ru browser (e.g. German)", () => {
    expect(resolveShareLocale(undefined, "de-DE,de;q=0.9")).toBe("ru");
    expect(resolveShareLocale(undefined, "fr-FR")).toBe("ru");
  });

  it("ignores zero-quality tags", () => {
    // en is explicitly refused (q=0); ru is the fallback.
    expect(resolveShareLocale(undefined, "en;q=0")).toBe("ru");
  });
});
