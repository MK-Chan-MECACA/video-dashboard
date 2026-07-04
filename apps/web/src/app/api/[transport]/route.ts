import { createMcpHandler, withMcpAuth } from 'mcp-handler';
import { TOOL_DEFS } from '@vd/shared';
import { ApiError, verifyApiKeyToken } from '@/lib/apiAuth';
import { executeTool } from '@/lib/mcpExecute';

export const maxDuration = 120;

/**
 * Remote MCP server (Streamable HTTP) at /api/mcp.
 * Authenticated with the same bearer API keys as /api/v1 (create one in Settings).
 * Tools come from the shared TOOL_DEFS and run in-process via the service layer.
 */
const handler = createMcpHandler(
  (server) => {
    for (const def of TOOL_DEFS) {
      server.tool(def.name, def.description, def.inputSchema, async (args, extra) => {
        const auth = extra.authInfo;
        const scopes = auth?.scopes ?? [];
        try {
          if (!def.readOnly && !scopes.includes('write')) {
            throw new ApiError(403, `The '${def.name}' tool requires an API key with the 'write' scope`);
          }
          const keyName = (auth?.extra?.keyName as string) ?? 'mcp';
          const db = (await import('@/lib/supabase')).supabaseAdmin();
          const result = await executeTool(def.name, args ?? {}, db, keyName);
          return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
        } catch (e) {
          const message = e instanceof ApiError ? `Error ${e.status}: ${e.message}` : String(e);
          return { content: [{ type: 'text', text: message }], isError: true };
        }
      });
    }
  },
  {
    serverInfo: { name: 'ttm-video-dashboard', version: '1.0.0' },
  },
  {
    basePath: '/api',
    maxDuration: 120,
    disableSse: true,
  },
);

const authedHandler = withMcpAuth(
  handler,
  async (_req, bearerToken) => {
    if (!bearerToken) return undefined;
    try {
      const ctx = await verifyApiKeyToken(bearerToken, 'read');
      if (!ctx) return undefined;
      return {
        token: bearerToken,
        clientId: ctx.keyId,
        scopes: ctx.scopes,
        extra: { keyName: ctx.keyName },
      };
    } catch {
      return undefined;
    }
  },
  { required: true },
);

export { authedHandler as GET, authedHandler as POST, authedHandler as DELETE };
