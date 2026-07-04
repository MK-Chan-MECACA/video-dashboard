#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { TOOL_DEFS } from '@vd/shared/mcpToolDefs';

/**
 * Thin stdio MCP server for the TTM Video Dashboard.
 * Every tool proxies to the dashboard's REST API (/api/v1) — the HTTP MCP
 * endpoint at <dashboard>/api/mcp exposes the identical tool surface.
 *
 * Env: TTM_API_URL (e.g. https://your-dashboard.vercel.app), TTM_API_KEY (ttm_live_…).
 */

const API_URL = process.env.TTM_API_URL?.replace(/\/$/, '');
const API_KEY = process.env.TTM_API_KEY;

if (!API_URL || !API_KEY) {
  console.error(
    'ttm-video-mcp: set TTM_API_URL (your dashboard URL) and TTM_API_KEY (create one in Settings → API keys).',
  );
  process.exit(1);
}

const server = new McpServer({ name: 'ttm-video-dashboard', version: '0.1.0' });

for (const def of TOOL_DEFS) {
  server.tool(def.name, def.description, def.inputSchema, async (args) => {
    const a = (args ?? {}) as Record<string, unknown>;
    const body = def.rest.body ? JSON.stringify(def.rest.body(a)) : undefined;
    let res: Response;
    try {
      res = await fetch(`${API_URL}${def.rest.path(a)}`, {
        method: def.rest.method,
        headers: {
          Authorization: `Bearer ${API_KEY}`,
          ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        body,
      });
    } catch (e) {
      return {
        content: [{ type: 'text' as const, text: `Request to ${API_URL} failed: ${String(e)}` }],
        isError: true,
      };
    }
    const text = await res.text();
    if (!res.ok) {
      return {
        content: [{ type: 'text' as const, text: `Error ${res.status}: ${text}` }],
        isError: true,
      };
    }
    return { content: [{ type: 'text' as const, text }] };
  });
}

await server.connect(new StdioServerTransport());
