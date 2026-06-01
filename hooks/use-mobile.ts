import * as React from "react"

/**
 * Canonical mobile/desktop divider for the whole app: < 768px (Tailwind `md`)
 * is "mobile". Pair this hook (for behavior — dnd sensors, long-press, and
 * which overlay variant to mount) with CSS `md:` utilities (for layout and
 * visibility) so structural changes don't flash on first paint: the hook is
 * `false` until mounted, whereas CSS applies during SSR.
 */
const MOBILE_BREAKPOINT = 768

export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState<boolean | undefined>(undefined)

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
    const onChange = () => {
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)
    }
    mql.addEventListener("change", onChange)
    setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)
    return () => mql.removeEventListener("change", onChange)
  }, [])

  return !!isMobile
}
