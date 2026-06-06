"use client";

import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { LazyMotion, MotionConfig, domMax } from "motion/react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import { UndoHotkey } from "@/components/undo-hotkey";

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
              <UndoHotkey />
              <Toaster closeButton position="bottom-right" />
            </TooltipProvider>
          </MotionConfig>
        </LazyMotion>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
