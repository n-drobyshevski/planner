"use client";

import { Lightbulb, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useDigest } from "@/lib/hooks/use-digest";
import type { DigestPayload } from "@/lib/insights/digest-payload";
import { InsightCard } from "./insight-card";

/**
 * The AI weekly digest atop the Optimize tab. Renders nothing when the server
 * has no model key (the probe says unavailable) — self-hosted installs lose
 * nothing, they just never see the card. Generation is always an explicit
 * click; repeats of the same data are served from the per-member DB cache.
 */
export function DigestCard({ payload }: { payload: DigestPayload }) {
  const { available, digest, isGenerating, generate } = useDigest(payload);

  if (available === false) return null;

  return (
    <InsightCard title="Digest">
      <div>
        {digest === null ? (
          isGenerating ? (
            <div className="space-y-2" aria-busy aria-label="Writing the digest">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-2/3" />
              <p className="text-xs text-muted-foreground">
                Reading the period&hellip; usually about ten seconds.
              </p>
            </div>
          ) : (
            <div className="flex flex-col items-start gap-2">
              <p className="text-sm text-muted-foreground">
                A short written read of this period — what stood out and what to
                do about it.
              </p>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={generate}
                  disabled={available === null}
                >
                  <Sparkles data-icon="inline-start" />
                  Write the digest
                </Button>
                <p className="text-[11px] text-muted-foreground">
                  Sends summary statistics and context names only — never event
                  details or sleep data.
                </p>
              </div>
            </div>
          )
        ) : (
          <div className="space-y-3">
            <p className="text-sm">{digest.summary}</p>
            <div className="space-y-2">
              {digest.observations.map((o, i) => (
                <div key={i} className="text-sm">
                  <p className="font-medium">{o.headline}</p>
                  <p className="text-muted-foreground">{o.detail}</p>
                </div>
              ))}
            </div>
            <ul className="space-y-2" role="list">
              {digest.recommendations.map((r, i) => (
                <li key={i} className="flex items-start gap-2 text-sm">
                  <Lightbulb
                    aria-hidden
                    className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                  />
                  <span>
                    <span className="font-medium">{r.action}</span>{" "}
                    <span className="text-muted-foreground">{r.rationale}</span>
                  </span>
                </li>
              ))}
            </ul>
            {/* No rewrite button on purpose: identical data is a cache hit by
                design, and any data change resets the card to idle anyway. */}
            <p className="text-[11px] text-muted-foreground">
              Written for {payload.period.label} from summary statistics only.
            </p>
          </div>
        )}
      </div>
    </InsightCard>
  );
}
