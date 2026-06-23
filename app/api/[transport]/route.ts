import { createMcpHandler, withMcpAuth } from "mcp-handler";
import { registerTools } from "@/lib/mcp/tools";
import { verifyMcpToken } from "@/lib/mcp/auth";
import {
  isMcpEnabled,
  getMcpRedisUrl,
  getMcpResourceUrl,
} from "@/lib/mcp/env";

/**
 * Remote MCP endpoint for the planner, mounted at `/api/mcp` (streamable HTTP).
 *
 * - The proxy matcher already excludes `/api/**`, so this is outside next-intl
 *   locale routing and the cookie auth gate — OAuth guards it instead.
 * - `withMcpAuth` validates the Supabase OAuth bearer token (see verifyMcpToken)
 *   and 401s with a pointer to the protected-resource metadata when absent.
 * - Tools run as the authenticated member; RLS does the rest.
 *
 * The dynamic `[transport]` segment lets mcp-handler distinguish `/api/mcp` from
 * `/api/sse` (SSE is disabled per the current MCP spec). Off unless MCP_ENABLED.
 */
export const maxDuration = 120;

const notFound = () =>
  new Response("Not found", {
    status: 404,
    headers: { "content-type": "text/plain" },
  });

function buildHandler(): (req: Request) => Promise<Response> {
  const handler = createMcpHandler(
    (server) => registerTools(server),
    { serverInfo: { name: "planner", version: "0.1.0" } },
    {
      basePath: "/api",
      redisUrl: getMcpRedisUrl(),
      disableSse: true,
      maxDuration,
      verboseLogs: process.env.NODE_ENV !== "production",
    },
  );

  return withMcpAuth(handler, verifyMcpToken, {
    required: true,
    resourceMetadataPath: "/.well-known/oauth-protected-resource",
    resourceUrl: getMcpResourceUrl(),
  });
}

const handler = isMcpEnabled() ? buildHandler() : null;

export const GET = handler ?? notFound;
export const POST = handler ?? notFound;
export const DELETE = handler ?? notFound;
