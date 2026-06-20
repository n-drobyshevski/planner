import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans, Manrope, Geist_Mono } from "next/font/google";
import { notFound } from "next/navigation";
import { NextIntlClientProvider, hasLocale } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { Analytics } from "@vercel/analytics/next";
import "../globals.css";
import { Providers } from "./providers";
import {
  DEFAULT_ACCENT,
  DEFAULT_TONE,
  DEFAULT_PALETTE,
} from "@/lib/theme/appearance";
import { APPEARANCE_INIT_SCRIPT } from "@/lib/theme/appearance-cookie";
import { getSiteOrigin } from "@/lib/site-url";
import { routing } from "@/i18n/routing";

// Latin brand face. Plus Jakarta Sans has no basic-Cyrillic glyphs (only
// `cyrillic-ext`, which omits U+0410–044F), so Russian text falls through
// (per-glyph) to Manrope below via the `--font-sans` stack — Latin stays Jakarta.
const jakarta = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  subsets: ["latin"],
});

// Cyrillic companion (geometric-humanist, pairs with Jakarta; matching 200–800
// variable range). Only fills the glyphs Jakarta lacks — Latin stays Jakarta
// because it comes first in the family stack.
const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin", "cyrillic"],
  // Not preloaded: it only fills the Cyrillic glyphs Jakarta lacks, so it's not
  // above-the-fold for the (measured) `en` locale. Skipping the preload keeps
  // Jakarta the lone high-priority font request at FCP; `ru` still swaps Manrope
  // in via `display: swap`.
  preload: false,
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  // Monospace for code/inputs — never above the fold, so it doesn't need to be a
  // render-blocking preload competing with the HTML/CSS.
  preload: false,
});

export const metadata: Metadata = {
  metadataBase: new URL(getSiteOrigin() ?? "https://planr.page"),
  title: "Planner",
  description: "A warm, shared calendar for two.",
};

/**
 * Viewport config lives in its own export (App Router): `viewport-fit=cover`
 * opts the page into the safe-area-inset env() values used by the mobile
 * chrome, and we never disable user zoom (a11y). themeColor matches the warm
 * paper / charcoal backgrounds so the browser UI blends in.
 */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#faf8f5" },
    { media: "(prefers-color-scheme: dark)", color: "#1c1917" },
  ],
};

/** Prerender a static shell for every supported locale. */
export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

/**
 * The root layout stays statically renderable per locale (no cookies/auth/DB):
 * `setRequestLocale` pins the locale so Cache Components can prerender the shell,
 * and `<html lang>` comes straight from the route segment. Per-user appearance is
 * still applied client-side before paint by `APPEARANCE_INIT_SCRIPT` (no color
 * flash, no request-time work on the document); the `.dark` class stays owned by
 * next-themes' own pre-paint script. `NextIntlClientProvider` (no props) forwards
 * the request's locale + messages to Client Components.
 */
export default async function RootLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);

  return (
    <html
      lang={locale}
      suppressHydrationWarning
      data-accent={DEFAULT_ACCENT}
      data-tone={DEFAULT_TONE}
      data-palette={DEFAULT_PALETTE}
      className={`${jakarta.variable} ${manrope.variable} ${geistMono.variable} h-full`}
    >
      <head>
        {/* Warm the TLS connection to Supabase so the first post-hydration
            workspace fetch (REST) doesn't pay for DNS + TLS on the critical
            path. `crossOrigin` matches the CORS data fetch; dns-prefetch is the
            fallback for browsers that ignore preconnect. */}
        {process.env.NEXT_PUBLIC_SUPABASE_URL ? (
          <>
            <link
              rel="preconnect"
              href={process.env.NEXT_PUBLIC_SUPABASE_URL}
              crossOrigin="anonymous"
            />
            <link
              rel="dns-prefetch"
              href={process.env.NEXT_PUBLIC_SUPABASE_URL}
            />
          </>
        ) : null}
        {/* Re-applies the cookie-backed accent/tone/palette onto <html> before
            paint — the no-flash trick (see APPEARANCE_INIT_SCRIPT / Phase 0
            color-splash fix). This MUST stay a raw inline <script> in <head>:
            it is parse-blocking, so it runs before the first paint. Do NOT swap
            it for `next/script` strategy="beforeInteractive" — that defers the
            inline script into Next's `self.__next_s` runtime queue (emitted
            after <body>), which runs during bootstrap, not before paint, and
            brings the accent splash back. React 19 logs a dev-only "script tag
            while rendering" warning for this server-rendered <script>; it is
            stripped from production builds and is harmless (next-themes uses the
            same pattern for its `.dark` pre-paint script). */}
        <script dangerouslySetInnerHTML={{ __html: APPEARANCE_INIT_SCRIPT }} />
      </head>
      <body className="min-h-full bg-background text-foreground">
        <NextIntlClientProvider>
          <Providers>{children}</Providers>
        </NextIntlClientProvider>
        <SpeedInsights />
        <Analytics />
      </body>
    </html>
  );
}
