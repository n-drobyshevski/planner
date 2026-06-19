import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans, Manrope, Geist_Mono } from "next/font/google";
import "../globals.css";
import {
  DEFAULT_ACCENT,
  DEFAULT_TONE,
  DEFAULT_PALETTE,
} from "@/lib/theme/appearance";

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
// English-only does NOT mean "no next-intl context": the calendar leaves this page
// reuses (TimeGrid / MonthGrid / EventBlock …) call `useTranslations` and throw
// without a `NextIntlClientProvider` in scope. That provider lives in the page,
// INSIDE the dynamic <Suspense> boundary (see app/share/[token]/page.tsx) — keeping
// this shared layout a static shell that reads no request data.

const jakarta = Plus_Jakarta_Sans({ variable: "--font-jakarta", subsets: ["latin"] });
const manrope = Manrope({ variable: "--font-manrope", subsets: ["latin", "cyrillic"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Shared calendar",
  description: "A read-only shared calendar.",
  // A public link should never be indexed.
  robots: { index: false, follow: false },
};

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
      lang="en"
      data-accent={DEFAULT_ACCENT}
      data-tone={DEFAULT_TONE}
      data-palette={DEFAULT_PALETTE}
      className={`${jakarta.variable} ${manrope.variable} ${geistMono.variable} h-full`}
    >
      <body className="min-h-full bg-background text-foreground">{children}</body>
    </html>
  );
}
