// Card registry + layout math for the customizable Overview dashboard.
// Pure (no I/O, no React) so layout normalization is unit-testable.
//
// The Overview tab renders a flat ordered list of cards; `kind` decides the
// frame: consecutive visible "stat" cards group into one StatGrid run, each
// "section" card stands alone. The member's stored layout is a loose
// { order?: string[]; hidden?: string[] } jsonb bag (insights_prefs.dashboard),
// so reads must survive rows written by older/newer clients: unknown ids are
// dropped, missing ids are appended in registry order, and an empty/absent
// layout reproduces today's default Overview exactly.

export type DashboardCardId =
  | "total"
  | "daily-avg"
  | "busiest-day"
  | "active-days"
  | "tasks-done"
  | "on-time"
  | "overdue"
  | "per-day"
  | "by-context"
  | "shifts"
  | "goals";

export interface DashboardCardDef {
  id: DashboardCardId;
  /** label shown in the customize sheet */
  label: string;
  /** "stat" cards group into StatGrid runs; "section" cards stand alone */
  kind: "stat" | "section";
  defaultVisible: boolean;
}

/** Registry order = default card order (today's Overview, top to bottom). */
export const DASHBOARD_CARDS: readonly DashboardCardDef[] = [
  { id: "total", label: "Total tracked", kind: "stat", defaultVisible: true },
  { id: "daily-avg", label: "Daily average", kind: "stat", defaultVisible: true },
  { id: "busiest-day", label: "Busiest day", kind: "stat", defaultVisible: true },
  { id: "active-days", label: "Active days", kind: "stat", defaultVisible: true },
  { id: "tasks-done", label: "Tasks done", kind: "stat", defaultVisible: true },
  { id: "on-time", label: "On time", kind: "stat", defaultVisible: true },
  { id: "overdue", label: "Overdue", kind: "stat", defaultVisible: true },
  { id: "per-day", label: "Per-day chart", kind: "section", defaultVisible: true },
  { id: "by-context", label: "By context", kind: "section", defaultVisible: true },
  { id: "shifts", label: "Shifts vs previous period", kind: "section", defaultVisible: true },
  { id: "goals", label: "Goal progress", kind: "section", defaultVisible: true },
] as const;

const DEF_BY_ID = new Map(DASHBOARD_CARDS.map((c) => [c.id, c]));

function isCardId(id: string): id is DashboardCardId {
  return DEF_BY_ID.has(id as DashboardCardId);
}

export interface DashboardLayout {
  /** every registry card exactly once, member order first */
  order: DashboardCardId[];
  hidden: ReadonlySet<DashboardCardId>;
}

/**
 * Normalize a stored layout against the registry: drop unknown/duplicate ids,
 * append registry cards the stored order doesn't know (new cards ship visible
 * per their default), and reduce `hidden` to known ids. `undefined`/junk input
 * yields the default layout.
 */
export function normalizeLayout(
  stored: { order?: string[]; hidden?: string[] } | undefined,
): DashboardLayout {
  const seen = new Set<DashboardCardId>();
  const order: DashboardCardId[] = [];
  for (const id of stored?.order ?? []) {
    if (isCardId(id) && !seen.has(id)) {
      seen.add(id);
      order.push(id);
    }
  }
  const hidden = new Set<DashboardCardId>();
  for (const id of stored?.hidden ?? []) {
    if (isCardId(id)) hidden.add(id);
  }
  for (const def of DASHBOARD_CARDS) {
    if (!seen.has(def.id)) {
      order.push(def.id);
      if (!def.defaultVisible && !(stored?.hidden ?? []).includes(def.id))
        hidden.add(def.id);
    }
  }
  return { order, hidden };
}

/** A render run: one StatGrid of consecutive stats, or one standalone section. */
export type DashboardRun =
  | { type: "stats"; ids: DashboardCardId[] }
  | { type: "section"; id: DashboardCardId };

/**
 * Group the layout's VISIBLE cards into render runs, preserving order:
 * consecutive stat cards share one StatGrid so the grid never fragments
 * unless the member interleaves a section between stats on purpose.
 */
export function layoutRuns(layout: DashboardLayout): DashboardRun[] {
  const runs: DashboardRun[] = [];
  for (const id of layout.order) {
    if (layout.hidden.has(id)) continue;
    const def = DEF_BY_ID.get(id);
    if (!def) continue;
    if (def.kind === "section") {
      runs.push({ type: "section", id });
    } else {
      const last = runs[runs.length - 1];
      if (last?.type === "stats") last.ids.push(id);
      else runs.push({ type: "stats", ids: [id] });
    }
  }
  return runs;
}

/**
 * Move a card one step up/down in the order (the keyboard-accessible
 * alternative to drag). Returns the same array when the move is out of
 * bounds, so callers can write back unconditionally.
 */
export function moveCard(
  order: DashboardCardId[],
  id: DashboardCardId,
  direction: "up" | "down",
): DashboardCardId[] {
  const i = order.indexOf(id);
  const j = direction === "up" ? i - 1 : i + 1;
  if (i < 0 || j < 0 || j >= order.length) return order;
  const next = [...order];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}

/** True when the layout differs from the registry default (anything stored). */
export function isCustomized(layout: DashboardLayout): boolean {
  return (
    layout.hidden.size > 0 ||
    layout.order.some((id, i) => DASHBOARD_CARDS[i]?.id !== id)
  );
}
