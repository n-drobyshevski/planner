import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans, Geist_Mono } from "next/font/google";
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
 */
async function getAppearance(): Promise<Appearance> {
  try {
    const sb = await createClient();
    const {
      data: { user },
    } = await sb.auth.getUser();
    if (!user) return DEFAULT_APPEARANCE;
    const { data } = await sb
      .from("members")
      .select("accent, surface_tone, palette")
      .eq("auth_user_id", user.id)
      .maybeSingle();
    return {
      accent: normalizeAccent(data?.accent),
      tone: normalizeTone(data?.surface_tone),
      palette: normalizePalette(data?.palette),
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
