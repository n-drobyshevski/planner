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
 * The Optimize tab's digest state. On mount (and whenever the payload's hash
 * changes — new period, new filters, new data) it probes with cachedOnly:
 * a cache hit renders instantly, "nothing cached" leaves the idle button, and
 * "unavailable" (no server API key) hides the card. Only the explicit
 * `generate()` click ever spends a model call.
 */
export function useDigest(payload: DigestPayload): DigestState {
  const [available, setAvailable] = useState<boolean | null>(null);
  const [digest, setDigest] = useState<Digest | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const hash = digestPayloadHash(payload);
  // The payload identity churns every render; the hash is the real identity.
  const payloadRef = useRef(payload);
  payloadRef.current = payload;

  useEffect(() => {
    let cancelled = false;
    setDigest(null);
    postDigest(payloadRef.current, true)
      .then((res) => {
        if (cancelled) return;
        setAvailable(res.available ?? false);
        const parsed = digestSchema.safeParse(res.digest);
        if (parsed.success) setDigest(parsed.data);
      })
      .catch(() => {
        // Probe failures (offline, 401 mid-signout) just leave the idle state.
        if (!cancelled) setAvailable((prev) => prev ?? null);
      });
    return () => {
      cancelled = true;
    };
  }, [hash]);

  const generate = useCallback(() => {
    setIsGenerating(true);
    postDigest(payloadRef.current, false)
      .then((res) => {
        setAvailable(res.available ?? false);
        const parsed = digestSchema.safeParse(res.digest);
        if (parsed.success) setDigest(parsed.data);
        else if (res.available !== false)
          toast.error("The digest came back malformed — try again.");
      })
      .catch((e: unknown) => {
        toast.error(
          e instanceof Error ? e.message : "The digest request failed.",
        );
      })
      .finally(() => setIsGenerating(false));
  }, []);

  return { available, digest, isGenerating, generate };
}
