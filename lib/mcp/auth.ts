import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import type { RequestHandlerExtra } from "@modelcontextprotocol/sdk/shared/protocol.js";
import type { ServerRequest, ServerNotification } from "@modelcontextprotocol/sdk/types.js";
import { clientForToken } from "./client";

/** What we stash on `AuthInfo.extra` so each tool can rebuild a scoped client. */
interface McpAuthExtra {
  token: string;
  memberId: string;
  workspaceId: string;
  sub: string;
}

function parseScopes(scope: unknown): string[] {
  return typeof scope === "string" && scope.length > 0 ? scope.split(/\s+/) : [];
}

/**
 * `withMcpAuth` verifier: validate the bearer token and resolve the planner
 * member it belongs to. Returns `undefined` (→ 401) when the token is absent,
 * invalid, or maps to no member.
 *
 * The token is a Supabase OAuth access token. `getClaims` verifies it locally
 * (asymmetric signing keys + cached JWKS) with no Auth-server roundtrip — the
 * same trade-off the request proxy already makes. We then look up the member by
 * `auth_user_id`; RLS lets a member read its own/partner rows, and the `eq`
 * pins the result to the caller.
 */
export async function verifyMcpToken(
  _req: Request,
  bearerToken?: string,
): Promise<AuthInfo | undefined> {
  if (!bearerToken) return undefined;

  const sb = clientForToken(bearerToken);

  const { data, error } = await sb.auth.getClaims(bearerToken);
  const claims = data?.claims;
  if (error || !claims?.sub) return undefined;

  const { data: member, error: memberError } = await sb
    .from("members")
    .select("id, workspace_id")
    .eq("auth_user_id", claims.sub)
    .maybeSingle();
  if (memberError || !member) return undefined;

  const extra: McpAuthExtra = {
    token: bearerToken,
    memberId: member.id as string,
    workspaceId: member.workspace_id as string,
    sub: claims.sub,
  };

  return {
    token: bearerToken,
    clientId:
      (claims as Record<string, unknown>).client_id?.toString() ??
      (claims as Record<string, unknown>).azp?.toString() ??
      claims.sub,
    scopes: parseScopes((claims as Record<string, unknown>).scope),
    expiresAt: typeof claims.exp === "number" ? claims.exp : undefined,
    extra: extra as unknown as Record<string, unknown>,
  };
}

export interface McpContext {
  /** Member-scoped Supabase client (RLS enforced). */
  sb: SupabaseClient;
  /** The calling member's id. */
  memberId: string;
  /** The member's (single) workspace id. */
  workspaceId: string;
}

/**
 * Rebuild the per-request scoped context inside a tool handler from the
 * `authInfo` the verifier attached. Throws if somehow called unauthenticated
 * (the handler is wrapped in `withMcpAuth({ required: true })`, so this is a
 * defensive guard, not a normal path).
 */
export function mcpContext(
  extra: RequestHandlerExtra<ServerRequest, ServerNotification>,
): McpContext {
  const auth = extra.authInfo;
  const data = auth?.extra as McpAuthExtra | undefined;
  if (!data?.token) {
    throw new Error("MCP tool invoked without an authenticated member.");
  }
  return {
    sb: clientForToken(data.token),
    memberId: data.memberId,
    workspaceId: data.workspaceId,
  };
}
