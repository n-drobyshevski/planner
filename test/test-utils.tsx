import { type ReactElement, type ReactNode } from "react";
import {
  render as rtlRender,
  type RenderOptions,
} from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "@/messages/en";

/**
 * Test render that wraps every component in a `NextIntlClientProvider` with the
 * real English catalog, so components using `useTranslations`/`useLocale` render
 * their (English) copy instead of throwing "No intl context". Any test-supplied
 * `wrapper` (e.g. a QueryClientProvider) is composed *inside* the intl provider.
 * `timeZone` is pinned so date formatters are deterministic.
 *
 * Drop-in for `@testing-library/react`: import `render`/`screen`/etc. from here.
 */
function customRender(
  ui: ReactElement,
  options?: RenderOptions,
) {
  const UserWrapper = options?.wrapper;
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
      {UserWrapper ? <UserWrapper>{children}</UserWrapper> : children}
    </NextIntlClientProvider>
  );
  return rtlRender(ui, { ...options, wrapper: Wrapper });
}

export * from "@testing-library/react";
export { customRender as render };
