import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans, Manrope } from "next/font/google";
import "../globals.css";
import { DEFAULT_TONE, DEFAULT_PALETTE } from "@/lib/theme/appearance";

// A THIRD root layout (beside app/[locale]/layout.tsx and app/share/layout.tsx)
// for `/app/*` — the Android app's App Link paths. Today that's only the OAuth
// callback fallback, which must sit OUTSIDE `[locale]` (its URL is registered
// verbatim with Supabase and must never be locale-prefixed or rewritten) and
// OUTSIDE the auth proxy (see the matcher in proxy.ts).
//
// Deliberately minimal: no providers, no theme cookie, and NO analytics or speed
// insights — the callback URL carries a one-time authorization code in its query,
// which must never be reported to a third party. `referrer: no-referrer` keeps it
// out of the Referer header if the visitor follows a link onward.

const jakarta = Plus_Jakarta_Sans({ variable: "--font-jakarta", subsets: ["latin"] });
const manrope = Manrope({ variable: "--font-manrope", subsets: ["latin", "cyrillic"] });

export const metadata: Metadata = {
  title: "Planr",
  referrer: "no-referrer",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#faf8f5",
};

export default function AppLinkRootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      data-accent="stone"
      data-tone={DEFAULT_TONE}
      data-palette={DEFAULT_PALETTE}
      className={`${jakarta.variable} ${manrope.variable} h-full`}
    >
      <body className="min-h-full bg-background text-foreground">{children}</body>
    </html>
  );
}
