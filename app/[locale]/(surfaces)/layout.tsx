import { SurfaceChrome } from "@/components/surface-chrome";

/**
 * Shared frame for the Calendar/Tasks/Insights surfaces. Must stay static (no
 * cookies/auth/await) so Cache Components prerenders the header into the
 * static shell — first paint shows real app chrome while the surface streams.
 * As a layout it also persists across surface↔surface navigation; only the
 * content below it remounts (and crossfades, via the sibling template.tsx).
 */
export default function SurfacesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <SurfaceChrome>{children}</SurfaceChrome>;
}
