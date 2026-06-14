import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans, Geist_Mono } from "next/font/google";
import { notFound } from "next/navigation";
import { NextIntlClientProvider, hasLocale } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import "../globals.css";
import { Providers } from "./providers";
import {
  DEFAULT_ACCENT,
  DEFAULT_TONE,
  DEFAULT_PALETTE,
} from "@/lib/theme/appearance";
import { APPEARANCE_INIT_SCRIPT } from "@/lib/theme/appearance-cookie";
import { routing } from "@/i18n/routing";

const jakarta = Plus_Jakarta_Sans({
  variable: "--font-sans",
  // Plus Jakarta Sans has no basic-Cyrillic glyphs (only `cyrillic-ext`, which
  // omits U+0410–044F), so Russian text falls through to the Cyrillic-capable
  // companion below via the `--font-sans` stack — Latin stays Jakarta.
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
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
      className={`${jakarta.variable} ${geistMono.variable} h-full`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: APPEARANCE_INIT_SCRIPT }} />
      </head>
      <body className="min-h-full bg-background text-foreground">
        <NextIntlClientProvider>
          <Providers>{children}</Providers>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
