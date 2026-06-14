import { defineRouting } from "next-intl/routing";

/**
 * Locale routing for the app. English keeps today's bare URLs (`/calendar`)
 * via `localePrefix: "as-needed"`; Russian lives under `/ru/*`. `localeDetection`
 * (on by default) reads the browser `Accept-Language` on first visit, so a
 * Russian browser lands on `/ru/...` automatically — still overridable in
 * Settings, which persists the choice to the member profile.
 */
export const routing = defineRouting({
  locales: ["en", "ru"],
  defaultLocale: "en",
  localePrefix: "as-needed",
});

export type Locale = (typeof routing.locales)[number];
