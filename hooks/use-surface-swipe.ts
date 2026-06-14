import { usePathname, useRouter } from "@/i18n/navigation";
import { useSwipe } from "@/hooks/use-swipe";
import { useIsMobile } from "@/hooks/use-mobile";
import { SURFACE_PATHS } from "@/lib/surfaces";

/**
 * Touch-only header gesture: swipe left/right to move between the top-level
 * surfaces (Calendar → Tasks → Insights), matching the AppNav dropdown order.
 * Swiping left advances to the next surface, right goes back; clamped at the
 * ends (no wrap). Mobile-gated, so desktop is untouched. Spread the returned
 * handlers on the toolbar `<header>`.
 */
export function useSurfaceSwipe() {
  const router = useRouter();
  const pathname = usePathname();
  const isMobile = useIsMobile();
  const index = SURFACE_PATHS.findIndex((p) => pathname.startsWith(p));
  return useSwipe({
    enabled: isMobile && index !== -1,
    onSwipeLeft: () => {
      if (index < SURFACE_PATHS.length - 1) router.push(SURFACE_PATHS[index + 1]);
    },
    onSwipeRight: () => {
      if (index > 0) router.push(SURFACE_PATHS[index - 1]);
    },
  });
}
