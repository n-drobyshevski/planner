import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans, Geist_Mono } from "next/font/google";
import { unstable_cache } from "next/cache";
import "./globals.css";
import { Providers } from "./providers";
import { createClient } from "@/lib/supabase/server";
import {
  DEFAULT_ACCENT,
  DEFAULT_TONE,
  DEFAULT_PALETTE,
  normalizeAccent,
  normalizeTone,
  normalizePalette,
  appearanceTag,
} from "@/lib/theme/appearance";
import type { AccentId, Palette, SurfaceTone } from "@/lib/types";

type Appearance = { accent: AccentId; tone: SurfaceTone; palette: Palette };

const DEFAULT_APPEARANCE: Appearance = {
  accent: DEFAULT_ACCENT,
  tone: DEFAULT_TONE,
  palette: DEFAULT_PALETTE,
};

/**
 * Read the signed-in member's accent/tone/palette server-side so we can set the
 * matching <html> data attributes in the initial HTML — no color flash on load.
 * Falls back to defaults when signed out (e.g. /login) or on any error. (The
 * `.dark` class itself is owned by next-themes' pre-paint script; a Catppuccin
 * flavor's surfaces are absolute so they render correctly regardless.)
 *
 * Two TTFB optimizations on this per-navigation, HTML-blocking path:
 *   1. The user id comes from `getClaims()` (verifies the JWT from the session
 *      cookie, no Auth-server revoke roundtrip) rather than `getUser()`. The
 *      proxy/middleware already ran `getUser()` as the security gate microseconds
 *      earlier; appearance is non-sensitive, so a stale cookie at worst paints
 *      one wrong color that the client `usePreferences` effect re-asserts.
 *   2. The members SELECT is wrapped in `unstable_cache`, keyed + tagged by the
 *      auth user id, so it's a cache hit on nearly every navigation. The cookie
 *      read happens *outside* the cached scope (the captured `sb` client only
 *      runs the query on a cache miss); `revalidateAppearance` busts the tag when
 *      the member changes a preference.
 */
async function getAppearance(): Promise<Appearance> {
  try {
    const sb = await createClient();
    const { data } = await sb.auth.getClaims();
    const userId = data?.claims?.sub;
    if (!userId) return DEFAULT_APPEARANCE;

    const readAppearance = unstable_cache(
      async () => {
        const { data: member } = await sb
          .from("members")
          .select("accent, surface_tone, palette")
          .eq("auth_user_id", userId)
          .maybeSingle();
        return member ?? null;
      },
      ["appearance", userId],
      { tags: [appearanceTag(userId)], revalidate: 3600 },
    );

    const member = await readAppearance();
    return {
      accent: normalizeAccent(member?.accent),
      tone: normalizeTone(member?.surface_tone),
      palette: normalizePalette(member?.palette),
    };
  } catch {
    return DEFAULT_APPEARANCE;
  }
}

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

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const { accent, tone, palette } = await getAppearance();
  return (
    <html
      lang="en"
      suppressHydrationWarning
      data-accent={accent}
      data-tone={palette === "default" ? tone : "warm"}
      data-palette={palette}
      className={`${jakarta.variable} ${geistMono.variable} h-full`}
    >
      <body className="min-h-full bg-background text-foreground">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
