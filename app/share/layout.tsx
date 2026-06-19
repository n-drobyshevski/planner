import type { Viewport } from "next";
import { Plus_Jakarta_Sans, Manrope, Geist_Mono } from "next/font/google";
import "../globals.css";
import { DEFAULT_TONE, DEFAULT_PALETTE } from "@/lib/theme/appearance";

// A SECOND root layout (the app's other root is app/[locale]/layout.tsx). It sits
// at `app/share/` — a STATIC segment — rather than under `[token]`, so the token
// is an ordinary child param, not a root parameter (Cache Components requires root
// params to be statically enumerated, which a public link can't be).
//
// The public share surface lives OUTSIDE [locale] and OUTSIDE the auth proxy — it
// is anonymous and read-only, so it gets its own minimal, quiet chrome: warm paper,
// a fixed light appearance (no per-user accent cookie, no theme toggle), English
// only (no next-intl ROUTING). Deliberately NOT the private app.
//
// The calendar leaves this page reuses (TimeGrid / MonthGrid / EventBlock …) call
// `useTranslations` and throw without a `NextIntlClientProvider` in scope. That
// provider lives in the page, INSIDE the dynamic <Suspense> boundary, with the
// locale resolved per-request (see app/share/[token]/page.tsx) — keeping this
// shared layout a static shell that reads no request data.
//
// i18n / `lang`: locale negotiation (cookie → Accept-Language → Russian) is
// per-request and would make this shell dynamic, defeating the static-chrome-first
// design. So the static `<html lang>` carries the surface's default (Russian), and
// the accurate per-request `lang` is set on the content roots inside the dynamic
// subtree (PublicCalendarView / PublicShareInactive). Screen readers honour the
// nearest ancestor `lang`, so the inner value wins where content actually renders.
// Page metadata (title/description) is localised by the page's `generateMetadata`.

const jakarta = Plus_Jakarta_Sans({ variable: "--font-jakarta", subsets: ["latin"] });
const manrope = Manrope({ variable: "--font-manrope", subsets: ["latin", "cyrillic"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#faf8f5",
};

export default function ShareRootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="ru"
      // A neutral, brand-free accent for the anonymous public surface: warm
      // stone replaces terracotta so the today marker / focus ring stay quiet.
      // "stone" is a public-only accent (see [data-accent="stone"] in globals.css),
      // intentionally not part of the in-app accent picker.
      data-accent="stone"
      data-tone={DEFAULT_TONE}
      data-palette={DEFAULT_PALETTE}
      className={`${jakarta.variable} ${manrope.variable} ${geistMono.variable} h-full`}
    >
      <body className="min-h-full bg-background text-foreground">{children}</body>
    </html>
  );
}
