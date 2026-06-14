import { getRequestConfig } from "next-intl/server";
import { hasLocale } from "next-intl";
import { routing } from "./routing";

/**
 * Per-request next-intl config: resolve the active locale from the `[locale]`
 * route segment (falling back to the default) and load that locale's message
 * catalog. Server Components render with these messages, so translated markup is
 * never shipped as client JS unless a Client Component asks for it.
 */
export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = hasLocale(routing.locales, requested)
    ? requested
    : routing.defaultLocale;

  return {
    locale,
    messages: (await import(`../messages/${locale}/index`)).default,
  };
});
