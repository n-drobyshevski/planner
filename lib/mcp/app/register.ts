import "server-only";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import {
  RESOURCE_MIME_TYPE,
  registerAppResource,
  registerAppTool,
} from "@modelcontextprotocol/ext-apps/server";

import { FLOWS_APP_HTML } from "./flows-app.generated";

/** The view's address. Bump the suffix when a host must not reuse a cached copy. */
export const FLOWS_APP_URI = "ui://planner/flows.html";

type ShowFlowsHandler = (
  // The shape is validated by the SDK against `inputSchema` before this runs.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  args: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  extra: any,
) => Promise<CallToolResult>;

/**
 * Register the Flows MCP App: the `show_flows` tool and the view it opens.
 *
 * `show_flows` returns the same streams as `get_flows`, twice: as compact JSON
 * text for the model, and as `structuredContent` for the view. A host that
 * supports MCP Apps reads `_meta.ui.resourceUri`, fetches the HTML resource and
 * renders it in a sandboxed iframe beside the answer; any other host just sees
 * an ordinary tool with a text result.
 *
 * The view declares no CSP domains: it is one self-contained document (see
 * scripts/build-mcp-app.mjs) and loads nothing from the network. It can call
 * this server's tools only through the host, which sends them with the
 * member's own token, so RLS still decides what it sees and may change.
 */
export function registerFlowsApp(
  server: McpServer,
  inputSchema: Record<string, unknown>,
  handler: ShowFlowsHandler,
): void {
  registerAppTool(
    server,
    "show_flows",
    {
      title: "Show flows",
      description:
        "Show the user their tasks as streams, in an interactive view: which " +
        "streams and tasks need attention now, with deadlines on a small " +
        "timeline. The user can regroup, switch the attention rule and mark a " +
        "task done there. Use this when the user wants to SEE their streams or " +
        "decide what to work on; use get_flows when you only need the numbers. " +
        "Same arguments and data as get_flows.",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      inputSchema: inputSchema as any,
      annotations: { readOnlyHint: true, openWorldHint: false },
      _meta: { ui: { resourceUri: FLOWS_APP_URI } },
    },
    handler,
  );

  registerAppResource(
    server,
    "Planner flows",
    FLOWS_APP_URI,
    { description: "Interactive view of the planner's task streams." },
    async () => ({
      contents: [{ uri: FLOWS_APP_URI, mimeType: RESOURCE_MIME_TYPE, text: FLOWS_APP_HTML }],
    }),
  );
}
