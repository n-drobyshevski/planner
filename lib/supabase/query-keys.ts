// React Query key factory — keep keys consistent across queries, mutations,
// optimistic updates, and realtime invalidation.

export const qk = {
  workspace: ["workspace"] as const,
  members: (workspaceId: string) => ["members", workspaceId] as const,
  categories: (workspaceId: string) => ["categories", workspaceId] as const,
  /** Events + overrides for a visible window. */
  window: (workspaceId: string, start: number, end: number) =>
    ["events", workspaceId, start, end] as const,
  /** Match-all prefix for invalidating every window query on realtime change. */
  eventsAll: (workspaceId: string) => ["events", workspaceId] as const,
  /** All tasks (+ subtasks) in the workspace; not windowed. */
  tasks: (workspaceId: string) => ["tasks", workspaceId] as const,
};
