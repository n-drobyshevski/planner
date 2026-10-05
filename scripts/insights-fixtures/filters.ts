/**
 * Insights fixtures, area "filters" (owner: F0): the viewer scoping every tab
 * reads through.
 *
 * ```ts
 * sections: {
 *   filterForInsights: {                       // lib/insights/filters.ts
 *     name;
 *     input: { spans: SpanJson[]; viewerId: string; hiddenCategoryIds: string[]; includeInactive: boolean };
 *     expected: string[];                      // the kept span keys, in input order
 *   }[];
 *   isTracked: {                               // lib/analytics/usage.ts
 *     name; input: { span: SpanJson; includeInactive: boolean }; expected: boolean;
 *   }[];
 *   viewerTasks: {                             // insights-shell.tsx: owner or assignee
 *     name; input: { tasks: TaskJson[]; viewerId: string }; expected: string[];   // kept ids, in order
 *   }[];
 * }
 * ```
 */
import { isTracked } from "@/lib/analytics/usage";
import { filterForInsights } from "@/lib/insights/filters";
import type { TaskRow } from "@/lib/types";
import {
  HOUR,
  ZONES,
  scenario,
  span,
  task,
  toOccurrence,
  toTaskRow,
  type Case,
  type SpanJson,
  type TaskJson,
} from "./shared";

export const sections = ["filterForInsights", "isTracked", "viewerTasks"] as const;

const T0 = Date.UTC(2026, 5, 1);

/** test/insights/filters.test.ts `occ()` defaults, as a SpanJson. */
function occ(over: Partial<SpanJson> & { key: string }): SpanJson {
  return span({ start: T0 + 9 * HOUR, end: T0 + 10 * HOUR, title: "t", eventId: "e", ...over });
}

function filterCase(
  name: string,
  spans: SpanJson[],
  hiddenCategoryIds: string[] = [],
  includeInactive = false,
  viewerId = "me",
): Case {
  return {
    name,
    input: { spans, viewerId, hiddenCategoryIds, includeInactive },
    expected: filterForInsights(spans.map(toOccurrence), {
      viewerId,
      hiddenCategoryIds: new Set(hiddenCategoryIds),
      includeInactive,
    }).map((o) => o.key),
  };
}

/** insights-shell.tsx:250 (inline there; the one scoping rule with no export). */
function viewerTasks(tasks: TaskRow[], viewerId: string): TaskRow[] {
  return tasks.filter((t) => t.ownerId === viewerId || t.assigneeId === viewerId);
}

function taskCase(name: string, tasks: TaskJson[], viewerId = "me"): Case {
  return {
    name,
    input: { tasks, viewerId },
    expected: viewerTasks(tasks.map(toTaskRow), viewerId).map((t) => t.id),
  };
}

export function build(): Record<(typeof sections)[number], Case[]> {
  const filterCases: Case[] = [
    filterCase("filterForInsights / drops untracked occurrences (all-day, context, inactive)", [
      occ({ key: "a" }),
      occ({ key: "b", allDay: true }),
      occ({ key: "c", kind: "context" }),
      occ({ key: "d", inactive: true }),
    ]),
    filterCase(
      "filterForInsights / keeps inactive blocks when includeInactive is set",
      [occ({ key: "a", inactive: true }), occ({ key: "b", allDay: true })],
      [],
      true,
    ),
    filterCase(
      "filterForInsights / keeps the viewer's own and joint items, dropping the partner's solo events",
      [
        occ({ key: "mine" }),
        occ({ key: "theirs", ownerId: "you" }),
        occ({ key: "joint", ownerId: "you", isShared: true }),
      ],
    ),
    filterCase(
      "filterForInsights / drops hidden categories but never uncategorized items",
      [
        occ({ key: "a", categoryId: "work" }),
        occ({ key: "b", categoryId: "gym" }),
        occ({ key: "c", categoryId: null }),
      ],
      ["work"],
    ),
    filterCase(
      "filterForInsights / applies all filters in one pass",
      [
        occ({ key: "a", inactive: true, categoryId: "sleep" }),
        occ({ key: "b", inactive: true, categoryId: "hidden" }),
        occ({ key: "c", ownerId: "you" }),
        occ({ key: "d", ownerId: "you", isShared: true, categoryId: "work" }),
      ],
      ["hidden"],
      true,
    ),
    filterCase("empty input", []),
    filterCase(
      "a hidden joint item is dropped too",
      [occ({ key: "j", ownerId: "you", isShared: true, categoryId: "work" }), occ({ key: "m" })],
      ["work"],
    ),
    filterCase(
      "the partner's own view keeps their solo items",
      [occ({ key: "mine" }), occ({ key: "theirs", ownerId: "you" })],
      [],
      false,
      "you",
    ),
    filterCase(
      "inactive context and all-day stay out with includeInactive",
      [
        occ({ key: "ctx", kind: "context", inactive: true }),
        occ({ key: "day", allDay: true, inactive: true }),
        occ({ key: "ok", inactive: true }),
      ],
      [],
      true,
    ),
  ];
  ZONES.forEach((zone, z) => {
    const spans = scenario({ zone, firstDay: "2026-06-08", days: 7, seed: 100 + z });
    for (const includeInactive of [false, true]) {
      filterCases.push(
        filterCase(
          `scenario ${zone} hiding c2 and c5, includeInactive ${includeInactive}`,
          spans,
          ["c2", "c5"],
          includeInactive,
        ),
      );
    }
  });

  const tracked = (name: string, s: SpanJson, includeInactive: boolean): Case => ({
    name,
    input: { span: s, includeInactive },
    expected: isTracked(toOccurrence(s), includeInactive),
  });
  const plain = occ({ key: "e:0" });
  const isTrackedCases: Case[] = [
    tracked("isTracked / keeps normal timed events", plain, false),
    tracked("isTracked / drops all-day", { ...plain, allDay: true }, false),
    tracked("isTracked / drops inactive", { ...plain, inactive: true }, false),
    tracked("isTracked / drops context", { ...plain, kind: "context" }, false),
    tracked("isTracked / keeps inactive blocks when includeInactive is set", { ...plain, inactive: true }, true),
    tracked("isTracked / never all-day with includeInactive", { ...plain, allDay: true }, true),
    tracked("isTracked / never context with includeInactive", { ...plain, kind: "context" }, true),
    tracked("normal timed event with includeInactive", plain, true),
    tracked("partner's event is still tracked (scoping is filterForInsights')", { ...plain, ownerId: "you" }, false),
  ];

  const created = Date.UTC(2026, 5, 1, 9);
  const taskCases: Case[] = [
    taskCase("owner or assignee, in order", [
      task({ id: "own", createdAt: created }),
      task({ id: "assigned", ownerId: "you", assigneeId: "me", createdAt: created }),
      task({ id: "theirs", ownerId: "you", createdAt: created }),
      task({ id: "theirs-assigned-away", ownerId: "you", assigneeId: "you", createdAt: created }),
      task({ id: "own-assigned-away", assigneeId: "you", createdAt: created }),
      task({ id: "own-sub", parentId: "own", createdAt: created }),
    ]),
    taskCase("empty", []),
    taskCase(
      "the partner's slice",
      [
        task({ id: "a", createdAt: created }),
        task({ id: "b", ownerId: "you", createdAt: created }),
        task({ id: "c", assigneeId: "you", createdAt: created }),
      ],
      "you",
    ),
  ];
  return { filterForInsights: filterCases, isTracked: isTrackedCases, viewerTasks: taskCases };
}
