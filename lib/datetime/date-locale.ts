import { ru } from "date-fns/locale";
import type { Locale } from "date-fns";

/**
 * The `date-fns` locale for an app locale string ("en" | "ru"). English is
 * date-fns' built-in default (`undefined`), so only Russian carries an explicit
 * locale object — that's what makes `format(..., { locale })` print Cyrillic,
 * genitive month names ("1 июня") and Russian weekday abbreviations.
 *
 * Pure (no React) so the datetime helpers and tests can call it directly;
 * components pass the active locale from next-intl's `useLocale()`.
 */
export function dateFnsLocale(locale: string): Locale | undefined {
  return locale === "ru" ? ru : undefined;
}
