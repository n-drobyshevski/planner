"use client";

import { useEffect } from "react";
import { useRouter } from "@/i18n/navigation";
import { AppNav } from "@/components/app-nav";
import { ToolbarUserMenu } from "@/components/toolbar-user-menu";
import { SlotTarget, ToolbarSlotsProvider } from "@/components/toolbar-slots";
import { useSurfaceSwipe } from "@/hooks/use-surface-swipe";
import { useWorkspace } from "@/lib/hooks/use-workspace";
import { SURFACE_PATHS } from "@/lib/surfaces";

/**
 * Self-fetching so the layout needs no per-request data (it must stay static
 * for the shell to prerender). Side benefit: the workspace query now starts as
 * soon as the chrome hydrates — before the surface shell streams in — and the
 * shells reuse it from the React Query cache.
 */
function ToolbarUser() {
  const { data } = useWorkspace();
  return <ToolbarUserMenu current={data?.currentMember ?? null} />;
}

/**
 * AppNav's links sit inside an unmounted DropdownMenuContent, so Next never
 * prefetches them on its own — yet surface switching (dropdown + swipe) is the
 * app's core navigation. Warm the sibling surfaces and /settings during idle
 * time (same pattern as useIdlePreload in lib/lazy.ts).
 */
function useIdleSurfacePrefetch() {
  const router = useRouter();
  useEffect(() => {
    const run = () => {
      for (const path of SURFACE_PATHS) router.prefetch(path);
      router.prefetch("/settings");
    };
    if ("requestIdleCallback" in window) {
      const id = window.requestIdleCallback(run);
      return () => window.cancelIdleCallback?.(id);
    }
    const t = setTimeout(run, 1500);
    return () => clearTimeout(t);
  }, [router]);
}

/**
 * The shared header + content frame for the Calendar/Tasks/Insights surfaces,
 * rendered by app/(surfaces)/layout.tsx. Owns everything the surfaces have in
 * common — AppNav, theme toggle + profile menu, the surface-switch swipe — and
 * exposes three portal slots (leading / center / trailing) the toolbars fill
 * with their own controls (see components/toolbar-slots.tsx).
 */
export function SurfaceChrome({ children }: { children: React.ReactNode }) {
  const surfaceSwipe = useSurfaceSwipe();
  useIdleSurfacePrefetch();

  return (
    <ToolbarSlotsProvider>
      <div className="flex h-dvh flex-col bg-background">
        {/* min-h-toolbar reserves the row's settled height so the bar doesn't
            shift when the portaled controls mount at hydration. */}
        <header
          {...surfaceSwipe}
          className="flex min-h-toolbar flex-wrap items-center gap-x-2 gap-y-1.5 border-b px-3 pt-safe pb-2 sm:px-4"
        >
          <SlotTarget name="leading" />
          <AppNav />
          <SlotTarget name="center" />
          <div className="ml-auto flex items-center gap-1 sm:gap-2">
            <SlotTarget name="trailing" />
            <div className="hidden items-center gap-2 md:flex">
              <ToolbarUser />
            </div>
          </div>
        </header>
        <div className="min-h-0 flex-1">{children}</div>
      </div>
    </ToolbarSlotsProvider>
  );
}
