// POST /api/share/[token]/request — the one UNAUTHENTICATED write in the app.
//
// A public viewer on a share link proposes a timeslot. This route is OUTSIDE the
// auth proxy (the matcher excludes `/api`), so it must defend itself:
//   1. zod-validate the body (bounded name/message, a sane time range);
//   2. a coarse per-IP token-bucket throttle (this instance) — first line;
//   3. the `submit_timeslot_request` SQL function (SECURITY DEFINER) is the
//      AUTHORITATIVE gate: it re-validates the token (active) and enforces the
//      per-share rate limits a token holder can't bypass.
// The row lands in the owner's Inbox (RLS-scoped to them). We never touch the
// events/requests tables directly here — only the anon RPC.

import { z } from "zod";

import { createPublicClient } from "@/lib/supabase/anon";
import { createIpRateLimiter } from "@/lib/rate-limit/ip-bucket";

// One limiter per server instance: a 5-request burst, then ~1/min sustained. The
// DB enforces the real per-share limit; this just blunts a single IP hammering us.
const ipLimiter = createIpRateLimiter({ capacity: 5, refillPerSec: 1 / 60 });

const bodySchema = z
  .object({
    name: z.string().trim().max(120).optional(),
    message: z.string().trim().max(1000).optional(),
    start: z.number().int().positive(),
    end: z.number().int().positive(),
  })
  .refine((b) => b.end > b.start, { message: "end must be after start" });

function clientIp(request: Request): string {
  const fwd = request.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]!.trim();
  return request.headers.get("x-real-ip")?.trim() || "unknown";
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  if (!token) {
    return Response.json({ error: "Missing share token." }, { status: 400 });
  }

  // Coarse per-IP throttle (defense in depth on top of the DB limit).
  const gate = ipLimiter.check(clientIp(request));
  if (!gate.ok) {
    return Response.json(
      { error: "Too many requests — please try again shortly." },
      { status: 429, headers: { "Retry-After": String(Math.ceil(gate.retryAfterMs / 1000)) } },
    );
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return Response.json({ error: "Malformed JSON body." }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }
  const body = parsed.data;

  const sb = createPublicClient();
  const { data, error } = await sb.rpc("submit_timeslot_request", {
    p_token: token,
    p_start: new Date(body.start).toISOString(),
    p_end: new Date(body.end).toISOString(),
    p_name: body.name ?? null,
    p_message: body.message ?? null,
  });

  if (error) {
    // The SQL function raises P0001 with a stable message we map to HTTP.
    const msg = error.message || "";
    if (msg.includes("invalid_or_expired_token")) {
      return Response.json({ error: "This link is no longer active." }, { status: 410 });
    }
    if (msg.includes("invalid_time_range")) {
      return Response.json({ error: "Invalid time range." }, { status: 400 });
    }
    if (msg.includes("rate_limited")) {
      return Response.json(
        { error: "This calendar has received too many requests recently — try again later." },
        { status: 429 },
      );
    }
    console.error("[planner] timeslot request failed:", error);
    return Response.json({ error: "Couldn't submit your request right now." }, { status: 502 });
  }

  return Response.json({ ok: true, id: data as string }, { status: 201 });
}
