// POST /api/insights/digest — the one server-side AI surface in the app.
//
// The client sends the compact aggregate payload (lib/insights/digest-payload
// — no event titles, no occurrence rows, no sleep data); this route
// authenticates the member, re-derives the cache hash server-side, and either
// returns the member's cached digest, declares the feature unavailable
// (no ANTHROPIC_API_KEY ⇒ the card hides itself), enforces the daily
// generation limit, or makes exactly one structured-output model call and
// caches the result. Branch logic lives in lib/insights/digest-service.ts
// (unit-tested with fakes); this file is the HTTP + Supabase + Anthropic
// wiring.

import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";

import { createClient } from "@/lib/supabase/server";
import {
  digestPayloadSchema,
  type DigestPayload,
} from "@/lib/insights/digest-payload";
import { digestSchema, type Digest } from "@/lib/insights/digest-schema";
import {
  resolveDigestRequest,
  DIGEST_DAILY_LIMIT,
} from "@/lib/insights/digest-service";

const MODEL = "claude-opus-4-8";

const SYSTEM_PROMPT = `You write the insights digest for a calm two-person shared planner. You receive one JSON object of aggregate statistics for a period: tracked time, context shares, task throughput, goal progress, a next-period outlook, anomalies, streaks, and the app's own rule-engine findings ("signals").

Rules:
- Ground EVERY statement in the provided numbers. Never invent data, never speculate beyond it, never assume why something happened.
- Write to "you", in a calm, concrete voice. No alarmism, no exclamation marks, no praise filler, no emoji.
- Render durations compactly from the minute values ("2h 30m", "45m"). Round freely; never show raw minute counts over 90.
- Comparisons: state direction plainly ("up about 2h on the previous period") and only when both sides are non-zero.
- Recommendations must be doable inside this app (move or shrink blocks, set or adjust a goal, schedule a task, protect a rest gap) and follow from the data — never generic wellness advice.
- If the data is thin, say so honestly in the summary rather than padding.`;

function userPrompt(payload: DigestPayload): string {
  // The digest is written in the member's UI language. English is the default
  // voice in SYSTEM_PROMPT; for Russian, direct the model explicitly (informal
  // "ты", Russian duration units) so it never mirrors the English examples.
  const langDirective =
    payload.period.locale === "ru"
      ? `\n\nWrite the ENTIRE digest in Russian, addressing the reader informally ("ты"). Render durations in Russian units (e.g. "2 ч 30 мин", "45 мин"), not "2h 30m".`
      : "";
  return `Period statistics as JSON:\n\n${JSON.stringify(payload)}\n\nWrite the digest for this period ("${payload.period.label}", lens: ${payload.period.lens}).${langDirective}`;
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Malformed JSON body." }, { status: 400 });
  }
  const { payload: rawPayload, cachedOnly } =
    (body as { payload?: unknown; cachedOnly?: unknown }) ?? {};
  const parsedPayload = digestPayloadSchema.safeParse(rawPayload);
  if (!parsedPayload.success) {
    return Response.json({ error: "Unrecognized payload." }, { status: 400 });
  }
  const payload = parsedPayload.data;

  const sb = await createClient();
  const { data: claims } = await sb.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (!userId) return Response.json({ error: "Not signed in." }, { status: 401 });
  const { data: member } = await sb
    .from("members")
    .select("id, workspace_id")
    .eq("auth_user_id", userId)
    .maybeSingle();
  if (!member) return Response.json({ error: "No member." }, { status: 401 });
  const memberId = member.id as string;
  const workspaceId = member.workspace_id as string;

  const apiKey = process.env.ANTHROPIC_API_KEY;

  const result = await resolveDigestRequest(
    payload,
    { cachedOnly: cachedOnly === true },
    {
      hasApiKey: Boolean(apiKey),
      async findCached(hash) {
        const { data, error } = await sb
          .from("insight_digests")
          .select("digest")
          .eq("member_id", memberId)
          .eq("period_hash", hash)
          .maybeSingle();
        if (error) throw error;
        return data?.digest ?? null;
      },
      async countToday() {
        const startOfUtcDay = new Date();
        startOfUtcDay.setUTCHours(0, 0, 0, 0);
        const { count, error } = await sb
          .from("insight_digests")
          .select("id", { count: "exact", head: true })
          .eq("member_id", memberId)
          .gte("created_at", startOfUtcDay.toISOString());
        if (error) throw error;
        return count ?? 0;
      },
      async generate(p): Promise<Digest> {
        const client = new Anthropic({ apiKey });
        const response = await client.messages.parse({
          model: MODEL,
          max_tokens: 2000,
          thinking: { type: "adaptive" },
          system: SYSTEM_PROMPT,
          output_config: { format: zodOutputFormat(digestSchema) },
          messages: [{ role: "user", content: userPrompt(p) }],
        });
        if (response.parsed_output === null) {
          throw new Error("The model returned no parseable digest.");
        }
        return response.parsed_output;
      },
      async save(hash, digest) {
        const { error } = await sb.from("insight_digests").upsert(
          {
            workspace_id: workspaceId,
            member_id: memberId,
            period_hash: hash,
            period_label: payload.period.label,
            digest,
            model: MODEL,
          },
          { onConflict: "member_id,period_hash" },
        );
        if (error) throw error;
      },
    },
  ).catch((e: unknown) => {
    console.error("[planner] digest generation failed:", e);
    return null;
  });

  if (result === null) {
    return Response.json(
      { error: "The digest couldn't be generated right now — try again shortly." },
      { status: 502 },
    );
  }
  switch (result.status) {
    case "unavailable":
      // 200 on purpose: "not configured" is a state the card hides on,
      // not an error to surface.
      return Response.json({ available: false });
    case "none":
      return Response.json({ available: true, digest: null });
    case "rate-limited":
      return Response.json(
        {
          error: `That's ${DIGEST_DAILY_LIMIT} digests today — the limit resets at midnight UTC.`,
        },
        { status: 429 },
      );
    case "ok":
      return Response.json({
        available: true,
        digest: result.digest,
        cached: result.cached,
      });
  }
}
