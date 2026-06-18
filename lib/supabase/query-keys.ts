// React Query key factory — keep keys consistent across queries, mutations,
// optimistic updates, and realtime invalidation.

export const qk = {
  workspace: ["workspace"] as const,
  members: (workspaceId: string) => ["members", workspaceId] as const,
  categories: (workspaceId: string) => ["categories", workspaceId] as const,
  collections: (workspaceId: string) => ["collections", workspaceId] as const,
  /** Events + overrides for a visible window. */
  window: (workspaceId: string, start: number, end: number) =>
    ["events", workspaceId, start, end] as const,
  /** Match-all prefix for invalidating every window query on realtime change. */
  eventsAll: (workspaceId: string) => ["events", workspaceId] as const,
  /**
   * Task-linked calendar blocks (events with task_id), un-windowed — for the
   * Flows view's scheduled-block markers. Keyed UNDER the `["events", id]`
   * prefix so the existing eventsAll invalidation (schedule / create / delete /
   * move) refreshes it automatically.
   */
  taskBlocks: (workspaceId: string) =>
    ["events", workspaceId, "task-blocks"] as const,
  /** All tasks (+ subtasks) in the workspace; not windowed. */
  tasks: (workspaceId: string) => ["tasks", workspaceId] as const,
  /** Append-only task status-change history for the workspace; not windowed. */
  taskStatusEvents: (workspaceId: string) =>
    ["task-status-events", workspaceId] as const,
  /** Flow milestone checkpoints for the workspace; not windowed. */
  taskCheckpoints: (workspaceId: string) =>
    ["task-checkpoints", workspaceId] as const,
  /** Task blocks/blocked-by dependency edges for the workspace; not windowed. */
  taskDependencies: (workspaceId: string) =>
    ["task-dependencies", workspaceId] as const,
  /** The viewer's sleep logs (member-private under RLS); not windowed. */
  sleepLogs: (workspaceId: string, memberId: string) =>
    ["sleep-logs", workspaceId, memberId] as const,
  /** Per-category weekly time goals (workspace-shared, like categories). */
  categoryGoals: (workspaceId: string) => ["category-goals", workspaceId] as const,
  /** The viewer's saved Insights views (member-private under RLS). */
  insightsViews: (workspaceId: string, memberId: string) =>
    ["insights-views", workspaceId, memberId] as const,
  /** The viewer's Insights dashboard prefs row (member-private under RLS). */
  insightsPrefs: (workspaceId: string, memberId: string) =>
    ["insights-prefs", workspaceId, memberId] as const,
};
