"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { LazyMotion, MotionConfig, domMax } from "motion/react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import { UndoHotkey } from "@/components/undo-hotkey";
import { markNavigated } from "@/components/crossfade";

/**
 * Flips the route crossfade's session flag on the first real client navigation
 * (not on initial load). It lives here — a stable leaf that persists across
 * navigations — so it observes pathname changes without remounting, and keeping
 * the flip off the template mount path is what makes the crossfade
 * hydration-safe (see components/crossfade.tsx). Renders nothing.
 */
function CrossfadeNavigationWatcher() {
  const pathname = usePathname();
  // Seeded with the first-rendered pathname, so the initial mount is a no-op —
  // and so is StrictMode's dev re-invocation of this effect (same pathname).
  // Flipping the flag during the initial load would race the late (surfaces)
  // hydration and bring the mismatch back; only a genuine route change marks it.
  const lastPath = useRef(pathname);
  useEffect(() => {
    if (lastPath.current === pathname) return;
    lastPath.current = pathname;
    markNavigated();
  }, [pathname]);
  return null;
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Supabase realtime invalidates these queries on every change, so
            // data stays fresh without time-based refetching. A long staleTime
            // (matching the workspace bundle) avoids redundant refetches on
            // remount/navigation; realtime is the real freshness mechanism.
            staleTime: 5 * 60_000,
            refetchOnWindowFocus: false,
            retry: 1,
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider
        attribute="class"
        defaultTheme="system"
        enableSystem
        disableTransitionOnChange
      >
        {/* `motion` features loaded lazily; `strict` forbids the heavy `motion.*`
            import so only the lightweight `m.*` components are used. domMax adds
            layout + drag features (board reorder, drag settle). reducedMotion=
            "user" makes JS-driven motion honor the OS setting, mirroring the
            global @media (prefers-reduced-motion) CSS rule. */}
        <LazyMotion features={domMax} strict>
          <MotionConfig reducedMotion="user">
            <TooltipProvider delayDuration={200}>
              {children}
              <CrossfadeNavigationWatcher />
              <UndoHotkey />
              <Toaster closeButton position="bottom-right" />
            </TooltipProvider>
          </MotionConfig>
        </LazyMotion>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
