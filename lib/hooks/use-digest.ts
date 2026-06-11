"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import {
  digestPayloadHash,
  type DigestPayload,
} from "@/lib/insights/digest-payload";
import { digestSchema, type Digest } from "@/lib/insights/digest-schema";

interface DigestResponse {
  available?: boolean;
  digest?: unknown;
  cached?: boolean;
  error?: string;
}

export interface DigestState {
  /** null until the probe answers; false hides the card entirely */
  available: boolean | null;
  digest: Digest | null;
  /** true while a generation (not the probe) is in flight */
  isGenerating: boolean;
  generate: () => void;
}

async function postDigest(
  payload: DigestPayload,
  cachedOnly: boolean,
): Promise<DigestResponse> {
  const res = await fetch("/api/insights/digest", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ payload, cachedOnly }),
  });
  const body = (await res.json().catch(() => ({}))) as DigestResponse;
  if (!res.ok) throw new Error(body.error ?? "The digest request failed.");
  return body;
}

/**
 * The Optimize tab's digest state. On every payload-hash change (new period,
 * new filters, new data) it probes with cachedOnly: a cache hit renders
 * instantly, "nothing cached" leaves the idle button, and "unavailable"
 * (no server API key) hides the card. Only the explicit `generate()` click
 * ever spends a model call.
 *
 * State is keyed by hash instead of being reset in the effect: a digest
 * fetched for hash A simply stops matching when the data moves to hash B —
 * no synchronous setState on data change, no flash of stale narrative.
 */
export function useDigest(payload: DigestPayload): DigestState {
  const hash = digestPayloadHash(payload);
  const payloadRef = useRef<DigestPayload | null>(null);
  const [available, setAvailable] = useState<boolean | null>(null);
  const [fetched, setFetched] = useState<{ hash: string; digest: Digest } | null>(
    null,
  );
  const [generatingHash, setGeneratingHash] = useState<string | null>(null);

  useEffect(() => {
    payloadRef.current = payload;
    let cancelled = false;
    postDigest(payload, true)
      .then((res) => {
        if (cancelled) return;
        setAvailable(res.available ?? false);
        const parsed = digestSchema.safeParse(res.digest);
        if (parsed.success) setFetched({ hash, digest: parsed.data });
      })
      .catch(() => {
        /* probe failures (offline, 401 mid-signout) just leave the idle state */
      });
    return () => {
      cancelled = true;
    };
    // The payload's object identity churns every render; `hash` fingerprints
    // its full contents, so it is the real dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hash]);

  const generate = useCallback(() => {
    const p = payloadRef.current;
    if (p === null) return;
    const h = digestPayloadHash(p);
    setGeneratingHash(h);
    postDigest(p, false)
      .then((res) => {
        setAvailable(res.available ?? false);
        const parsed = digestSchema.safeParse(res.digest);
        if (parsed.success) setFetched({ hash: h, digest: parsed.data });
        else if (res.available !== false)
          toast.error("The digest came back malformed — try again.");
      })
      .catch((e: unknown) => {
        toast.error(e instanceof Error ? e.message : "The digest request failed.");
      })
      .finally(() => setGeneratingHash((curr) => (curr === h ? null : curr)));
  }, []);

  return {
    available,
    digest: fetched?.hash === hash ? fetched.digest : null,
    isGenerating: generatingHash === hash,
    generate,
  };
}
