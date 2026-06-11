"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

/**
 * Portal slots for the shared surface header (components/surface-chrome.tsx).
 *
 * The header chrome (AppNav, user menu, swipe) lives in the persistent
 * `(surfaces)` layout so it prerenders into the Cache Components static shell
 * and survives surface↔surface navigation. The surface-specific controls,
 * though, are wired to each shell's state (view, period, callbacks), so the
 * shells inject them with `createPortal` into target elements the header owns:
 * the controls stay in the shell's React tree (state updates render in place),
 * while their DOM lands inside the header.
 */
type SlotName = "leading" | "center" | "trailing";

type SlotTargets = Partial<Record<SlotName, HTMLElement | null>>;

const ToolbarSlotsContext = createContext<{
  targets: SlotTargets;
  setTarget: (name: SlotName, el: HTMLElement | null) => void;
} | null>(null);

export function ToolbarSlotsProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [targets, setTargets] = useState<SlotTargets>({});
  const setTarget = useCallback((name: SlotName, el: HTMLElement | null) => {
    // Bail when unchanged so callback-ref churn can't re-render in a loop.
    setTargets((prev) => (prev[name] === el ? prev : { ...prev, [name]: el }));
  }, []);
  const value = useMemo(() => ({ targets, setTarget }), [targets, setTarget]);
  return (
    <ToolbarSlotsContext.Provider value={value}>
      {children}
    </ToolbarSlotsContext.Provider>
  );
}

/**
 * Where a slot's content lands in the header. `display: contents` makes the
 * portaled children participate directly in the header's flex row (gap,
 * ml-auto), as if they were rendered inline.
 */
export function SlotTarget({
  name,
  className,
}: {
  name: SlotName;
  className?: string;
}) {
  const ctx = useContext(ToolbarSlotsContext);
  if (!ctx) throw new Error("SlotTarget must be inside ToolbarSlotsProvider");
  const { setTarget } = ctx;
  const ref = useCallback(
    (el: HTMLElement | null) => setTarget(name, el),
    [name, setTarget],
  );
  return <div ref={ref} className={cn("contents", className)} />;
}

/**
 * Rendered by the surface toolbars to send their controls into the header.
 * Returns null until the target element lands in state (first client commit),
 * so the server render and the client's first render agree — in the
 * prerendered static shell the slots are simply empty until hydration, which
 * is the same moment the controls appear today.
 */
export function ToolbarSlot({
  name,
  children,
}: {
  name: SlotName;
  children: React.ReactNode;
}) {
  const ctx = useContext(ToolbarSlotsContext);
  if (!ctx) throw new Error("ToolbarSlot must be inside ToolbarSlotsProvider");
  const target = ctx.targets[name];
  return target ? createPortal(children, target) : null;
}
