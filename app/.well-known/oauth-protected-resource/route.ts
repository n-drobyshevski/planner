import {
  protectedResourceHandler,
  metadataCorsOptionsRequestHandler,
} from "mcp-handler";
import {
  isMcpEnabled,
  getSupabaseAuthIssuer,
  getMcpResourceUrl,
} from "@/lib/mcp/env";

/**
 * OAuth 2.0 Protected Resource Metadata (RFC 9728) for the MCP endpoint. MCP
 * clients fetch this to discover that the planner delegates authorization to the
 * Supabase OAuth server. The proxy matcher already excludes `/.well-known/**`
 * (its dot makes it match the "has an extension" exclusion), so it is reachable
 * unauthenticated and unprefixed.
 */
const notFound = () => new Response("Not found", { status: 404 });

const metadata = isMcpEnabled()
  ? protectedResourceHandler({
      authServerUrls: [getSupabaseAuthIssuer()],
      resourceUrl: getMcpResourceUrl(),
    })
  : null;

export const GET = metadata ?? notFound;
export const OPTIONS = isMcpEnabled()
  ? metadataCorsOptionsRequestHandler()
  : () => new Response(null, { status: 404 });
