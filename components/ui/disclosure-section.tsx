"use client"

import { ChevronDown } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from "@/components/ui/collapsible"

/**
 * A labelled, animated progressive-disclosure section for dialog forms.
 *
 * Wraps the Collapsible primitive with one consistent header — a promoted title,
 * a quiet "what's set" summary shown on the right only while collapsed, and a
 * chevron that rotates from the Radix open state — above a top hairline that
 * divides it from the section before it (never a hard rule, per DESIGN.md). The
 * body glides on a height + fade rather than snapping (globals.css
 * `collapsible-down/up`, slow/quint to match the motion system's accordion band;
 * the global prefers-reduced-motion rule already neutralises it).
 *
 * The event/context and task dialogs use it for both "More options" and
 * "Optimization details" so all four sections read identically.
 */
export function DisclosureSection({
  title,
  open,
  onOpenChange,
  forceOpen = false,
  summary,
  children,
  className,
  contentClassName,
}: {
  title: React.ReactNode
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Keep the section open and the header inert (e.g. a read-only dialog). */
  forceOpen?: boolean
  /** Quiet preview of set values, shown on the right only while collapsed. */
  summary?: React.ReactNode
  children: React.ReactNode
  className?: string
  contentClassName?: string
}) {
  const isOpen = forceOpen || open
  return (
    <Collapsible
      open={isOpen}
      onOpenChange={onOpenChange}
      className={cn("group/disclosure border-t border-border/60 pt-2", className)}
    >
      <CollapsibleTrigger asChild disabled={forceOpen}>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          // A real section header: full-width, ≥44px on touch, subtle hover
          // surface. No persistent open-state fill — the rotated chevron and the
          // revealed fields already carry "open" — and full opacity when inert.
          className="-mx-2.5 h-auto min-h-11 w-full justify-between gap-3 px-2.5 text-sm font-medium text-foreground aria-expanded:bg-transparent disabled:opacity-100 sm:min-h-9"
        >
          <span className="shrink-0">{title}</span>
          <span className="flex min-w-0 flex-1 items-center justify-end gap-2">
            {!isOpen && summary ? (
              // Duplicates the fields below, so it stays out of the a11y tree.
              <span
                aria-hidden
                className="min-w-0 truncate text-xs font-normal text-muted-foreground"
              >
                {summary}
              </span>
            ) : null}
            {!forceOpen ? (
              <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform duration-200 ease-out-quint group-data-[state=open]/disclosure:rotate-180" />
            ) : null}
          </span>
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent
        className={cn(
          "overflow-hidden",
          "data-[state=open]:animate-[collapsible-down_var(--dur-slow)_var(--ease-out-quint)]",
          "data-[state=closed]:animate-[collapsible-up_var(--dur-slow)_var(--ease-out-quint)]",
        )}
      >
        <div className={cn("pt-4", contentClassName)}>{children}</div>
      </CollapsibleContent>
    </Collapsible>
  )
}
