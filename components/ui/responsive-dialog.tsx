"use client";

import * as React from "react";

import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

/**
 * One editor surface, two presentations: a centered Dialog on desktop and a
 * bottom Sheet on phones. Sub-components pick the right primitive via context.
 *
 * Why a local synchronous check instead of the shared `useIsMobile()`: a
 * ResponsiveDialog only ever mounts in response to a user action (its parent
 * gates it behind `open` state that is false during SSR), so it never renders
 * on the server. Reading `window` in the lazy initializer is therefore safe and
 * — unlike the SSR-false shared hook — avoids a desktop→mobile flash on open.
 */
function useIsMobileNow() {
  const [isMobile, setIsMobile] = React.useState(() =>
    typeof window !== "undefined" ? window.innerWidth < 768 : false,
  );
  React.useEffect(() => {
    // The lazy initializer already read the correct width on mount; here we only
    // subscribe for later changes (setState in a listener, not synchronously in
    // the effect body).
    const mql = window.matchMedia("(max-width: 767px)");
    const onChange = () => setIsMobile(window.innerWidth < 768);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);
  return isMobile;
}

const ResponsiveContext = React.createContext(false);
const useResponsive = () => React.useContext(ResponsiveContext);

function ResponsiveDialog({
  children,
  ...props
}: React.ComponentProps<typeof Dialog>) {
  const isMobile = useIsMobileNow();
  const Root = isMobile ? Sheet : Dialog;
  return (
    <ResponsiveContext.Provider value={isMobile}>
      <Root data-slot="responsive-dialog" {...props}>
        {children}
      </Root>
    </ResponsiveContext.Provider>
  );
}

function ResponsiveDialogTrigger(
  props: React.ComponentProps<typeof DialogTrigger>,
) {
  const isMobile = useResponsive();
  const Trigger = isMobile ? SheetTrigger : DialogTrigger;
  return <Trigger {...props} />;
}

function ResponsiveDialogClose(props: React.ComponentProps<typeof DialogClose>) {
  const isMobile = useResponsive();
  const Close = isMobile ? SheetClose : DialogClose;
  return <Close {...props} />;
}

/**
 * Shared shell: a flex column capped at the viewport so the Header and Footer
 * stay pinned while the Body scrolls. On mobile it's a bottom sheet; on desktop
 * a centered card (wider than the default — sm:max-w-lg — for form-heavy use).
 *
 * `size` only affects the desktop dialog width: "default" stays at sm:max-w-lg,
 * "wide" opens to sm:max-w-3xl for two-column form bodies. It is deliberately
 * ignored on mobile — the bottom sheet is always full-width, and applying a
 * sm:max-w-* class there would wrongly constrain the sheet between 640–767px.
 */
function ResponsiveDialogContent({
  className,
  children,
  size = "default",
  ...props
}: React.ComponentProps<typeof DialogContent> & {
  size?: "default" | "wide";
}) {
  const isMobile = useResponsive();
  const base = "flex max-h-[85dvh] flex-col gap-0 overflow-hidden p-0";
  if (isMobile) {
    return (
      <SheetContent side="bottom" className={cn(base, className)} {...props}>
        {children}
      </SheetContent>
    );
  }
  // A caller's className still wins over the size-derived width (e.g. a narrower
  // sm:max-w-sm / sm:max-w-md) — twMerge resolves the later class.
  const width = size === "wide" ? "sm:max-w-3xl" : "sm:max-w-lg";
  return (
    <DialogContent className={cn(base, width, className)} {...props}>
      {children}
    </DialogContent>
  );
}

function ResponsiveDialogHeader({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="responsive-dialog-header"
      className={cn(
        // pr-12 reserves room for the absolute close button (size-7 @ right-4)
        // so a long title, badges, or the create-mode type toggle never slip
        // underneath it — on both the desktop dialog and the mobile sheet.
        "flex shrink-0 flex-col gap-1 pt-4 pr-12 pb-3 pl-4 text-left",
        className,
      )}
      {...props}
    />
  );
}

/** Scrollable middle region between the pinned header and footer. */
function ResponsiveDialogBody({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="responsive-dialog-body"
      className={cn("min-h-0 flex-1 overflow-y-auto px-4 py-1", className)}
      {...props}
    />
  );
}

function ResponsiveDialogFooter({
  className,
  ...props
}: React.ComponentProps<"div">) {
  const isMobile = useResponsive();
  return (
    <div
      data-slot="responsive-dialog-footer"
      className={cn(
        // Mobile: a plain top-to-bottom stack — DOM order is authored so the
        // primary action lands last (bottom, in thumb reach) and a destructive
        // action lands first (top, away from it). Desktop: a single row, the
        // caller deciding justify-between vs -end.
        "mt-auto flex shrink-0 flex-col gap-2 border-t bg-muted/50 px-4 py-3 sm:flex-row sm:justify-end",
        isMobile && "pb-safe",
        className,
      )}
      {...props}
    />
  );
}

function ResponsiveDialogTitle({
  className,
  ...props
}: React.ComponentProps<typeof DialogTitle>) {
  const isMobile = useResponsive();
  const Title = isMobile ? SheetTitle : DialogTitle;
  return <Title className={className} {...props} />;
}

function ResponsiveDialogDescription(
  props: React.ComponentProps<typeof DialogDescription>,
) {
  const isMobile = useResponsive();
  const Description = isMobile ? SheetDescription : DialogDescription;
  return <Description {...props} />;
}

export {
  ResponsiveDialog,
  ResponsiveDialogTrigger,
  ResponsiveDialogClose,
  ResponsiveDialogContent,
  ResponsiveDialogHeader,
  ResponsiveDialogBody,
  ResponsiveDialogFooter,
  ResponsiveDialogTitle,
  ResponsiveDialogDescription,
};
