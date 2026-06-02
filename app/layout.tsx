import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";
import {
  DEFAULT_ACCENT,
  DEFAULT_TONE,
  DEFAULT_PALETTE,
} from "@/lib/theme/appearance";
import { APPEARANCE_INIT_SCRIPT } from "@/lib/theme/appearance-cookie";

const jakarta = Plus_Jakarta_Sans({
  variable: "--font-sans",
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

/**
 * The root layout is intentionally static (no cookies/auth/DB) so Cache
 * Components can prerender it into the shared shell. Per-user appearance is
 * applied client-side before paint by `APPEARANCE_INIT_SCRIPT`, which reads the
 * appearance cookie and overrides the default <html> data attributes below —
 * no color flash, no request-time work on the document. (The `.dark` class is
 * still owned by next-themes' own pre-paint script.)
 */
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
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
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
