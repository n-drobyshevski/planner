/**
 * Insights fixtures, area "balance" (owner: A1): lib/analytics/balance.ts, the
 * category shares and share shifts behind Overview.
 *
 * ```ts
 * sections: {
 *   categoryShares: {
 *     name;
 *     input: { current: SpanJson[]; previous: SpanJson[]; curWindow: WindowJson; prevWindow: WindowJson };
 *     expected: {                     // current categories first, then previous-only; ms desc, then prevMs desc
 *       categoryId: string | null; ms: number; share: number;
 *       prevMs: number; prevShare: number; deltaShare: number;
 *     }[];
 *   }[];
 *   categoryByBucket: {
 *     name; input: { spans: SpanJson[]; buckets: WindowJson[]; topN: number };
 *     expected: { seriesKeys: string[]; rows: { start: Ms; end: Ms; byKey: Record<string, number> }[] };
 *   }[];
 * }
 * ```
 *
 * Seeds: test/analytics/balance.test.ts minus memberByBucket (not ported).
 * Added: equal-ms ties (broken by prevMs, then first-seen order), prev-only
 * categories, zero totals on either side, and a this-month scenario per zone
 * (viewer slice, usage.ts `viewerSpans`) against its previous month, plus its
 * week buckets for categoryByBucket.
 */
import { categoryByBucket, categoryShares } from "@/lib/analytics/balance";
import { DAY, HOUR, ZONES, span, toOccurrence, type Case, type SpanJson, type WindowJson } from "./shared";
import { resolveAt, viewerSpans } from "./usage";

export const sections = ["categoryShares", "categoryByBucket"] as const;

const T0 = Date.UTC(2026, 5, 1); // Mon 1 Jun 2026 UTC

/** balance.test.ts `occ()` defaults as a SpanJson. */
function occ(over: Partial<SpanJson> & { key?: string }): SpanJson {
  return span({ start: T0 + 9 * HOUR, end: T0 + 10 * HOUR, title: "t", eventId: "e", ...over, key: over.key ?? "e:0" });
}

const dayBuckets = (n: number): WindowJson[] =>
  Array.from({ length: n }, (_, i) => ({ start: T0 + i * DAY, end: T0 + (i + 1) * DAY }));

const curWin: WindowJson = { start: T0, end: T0 + 7 * DAY };
const prevWin: WindowJson = { start: T0 - 7 * DAY, end: T0 };

/** balance.test.ts `prevOcc`. */
const prevOcc = (categoryId: string | null, hours: number, key = "p") =>
  occ({ key: `${key}:${categoryId}`, categoryId, start: T0 - 3 * DAY, end: T0 - 3 * DAY + hours * HOUR });

/** A current-window span of `hours` on day `day`. */
const curOcc = (key: string, categoryId: string | null, hours: number, day = 0) =>
  occ({ key, categoryId, start: T0 + day * DAY + 8 * HOUR, end: T0 + day * DAY + (8 + hours) * HOUR });

function sharesCase(
  name: string,
  current: SpanJson[],
  previous: SpanJson[],
  cw: WindowJson = curWin,
  pw: WindowJson = prevWin,
): Case {
  return {
    name,
    input: { current, previous, curWindow: cw, prevWindow: pw },
    expected: categoryShares(current.map(toOccurrence), previous.map(toOccurrence), cw, pw),
  };
}

function bucketCase(name: string, spans: SpanJson[], buckets: WindowJson[], topN: number): Case {
  return {
    name,
    input: { spans, buckets, topN },
    expected: categoryByBucket(spans.map(toOccurrence), buckets, topN),
  };
}

function shareCases(): Case[] {
  const cs = "categoryShares";
  return [
    sharesCase(
      `${cs} / computes shares of each window total and the share shift`,
      [
        occ({ key: "a", categoryId: "work", start: T0 + 9 * HOUR, end: T0 + 12 * HOUR }),
        occ({ key: "b", categoryId: "gym", start: T0 + 13 * HOUR, end: T0 + 14 * HOUR }),
      ],
      [prevOcc("work", 1), prevOcc("gym", 1, "q")],
    ),
    sharesCase(
      `${cs} / includes categories that only exist in one window`,
      [occ({ key: "a", categoryId: "new", start: T0 + 9 * HOUR, end: T0 + 10 * HOUR })],
      [prevOcc("gone", 2)],
    ),
    sharesCase(`${cs} / yields zero shares when a window has no tracked time`, [], [prevOcc("work", 1)]),
    sharesCase(
      "equal ms ties break by prevMs, then keep first-seen order",
      [curOcc("a", "a", 2), curOcc("b", "b", 2), curOcc("c", "c", 2), curOcc("d", "d", 2)],
      [prevOcc("c", 1, "p1"), prevOcc("b", 3, "p2")],
    ),
    sharesCase(
      "prev-only categories rank by previous ms, after the current ones",
      [curOcc("a", "a", 1)],
      [prevOcc("x", 1, "p1"), prevOcc("y", 4, "p2"), prevOcc(null, 2, "p3"), prevOcc("z", 4, "p4")],
    ),
    sharesCase("both windows empty", [], []),
    sharesCase("previous window empty: prevShare 0 everywhere", [curOcc("a", "a", 3), curOcc("n", null, 1)], []),
    sharesCase(
      "spans are clipped to their own window",
      [occ({ key: "edge", categoryId: "a", start: T0 - 2 * HOUR, end: T0 + 2 * HOUR }), curOcc("b", "b", 6, 6)],
      [occ({ key: "late", categoryId: "a", start: T0 - HOUR, end: T0 + 5 * HOUR })],
    ),
    sharesCase(
      "thirds give repeating shares",
      [curOcc("a", "a", 1), curOcc("b", "b", 1, 1), curOcc("c", "c", 1, 2)],
      [prevOcc("a", 2, "p1"), prevOcc("c", 1, "p2")],
    ),
  ];
}

function byBucketCases(): Case[] {
  return [
    bucketCase(
      "categoryByBucket / matches the trends series shape (stacked-bar ready)",
      [
        occ({ key: "a", categoryId: "a", start: T0 + 9 * HOUR, end: T0 + 11 * HOUR }),
        occ({ key: "b", categoryId: "b", start: T0 + DAY, end: T0 + DAY + HOUR }),
        occ({ key: "c", categoryId: "c", start: T0 + DAY + HOUR, end: T0 + DAY + 90 * 60_000 }),
      ],
      dayBuckets(2),
      2,
    ),
    bucketCase("no spans", [], dayBuckets(3), 5),
  ];
}

function matrix(): { shares: Case[]; buckets: Case[] } {
  const shares: Case[] = [];
  const buckets: Case[] = [];
  ZONES.forEach((zone, z) => {
    const p = resolveAt(zone, "this-month", "2026-10-20", "week");
    if (!p) return;
    // Both windows share one case: 60 spans each keeps it within the budget.
    const current = viewerSpans(zone, p.window, 4000 + z, false, 60);
    const previous = viewerSpans(zone, p.prevWindow, 4100 + z, false, 60);
    const name = `scenario ${zone} this-month at 2026-10-20`;
    shares.push(sharesCase(`${name} vs the previous month`, current, previous, p.window, p.prevWindow));
    buckets.push(bucketCase(`${name}, week buckets, topN 5`, current, p.buckets, 5));
  });
  return { shares, buckets };
}

export function build(): Record<(typeof sections)[number], Case[]> {
  const m = matrix();
  return {
    categoryShares: [...shareCases(), ...m.shares],
    categoryByBucket: [...byBucketCases(), ...m.buckets],
  };
}
