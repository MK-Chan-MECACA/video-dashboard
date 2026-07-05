import Link from 'next/link';
import { appUrl } from '@/lib/services';
import { CodeBlock } from '@/components/CodeBlock';

export const dynamic = 'force-dynamic';

const ENDPOINTS: { method: string; path: string; scope: 'read' | 'write'; desc: string }[] = [
  { method: 'GET', path: '/videos?status=&limit=&offset=', scope: 'read', desc: 'List videos' },
  { method: 'POST', path: '/videos', scope: 'write', desc: 'Create video { title, topic_brief?, generate? } — generate: true writes the first script with Claude (~30–90s)' },
  { method: 'GET', path: '/videos/:id', scope: 'read', desc: 'Full detail: script, jobs, assets (1h download URLs), cost estimate, reviews, timeline' },
  { method: 'PATCH', path: '/videos/:id', scope: 'write', desc: 'Update { status?, video_no?, title?, topic_brief?, caption?, schedule_at? }' },
  { method: 'DELETE', path: '/videos/:id', scope: 'write', desc: 'Delete (blocked while the pipeline is actively processing)' },
  { method: 'POST', path: '/videos/:id/actions', scope: 'write', desc: 'send_for_review · retry_failed · regenerate_scene (+scene_index) · regenerate_avatar · re_render · approve_script · request_script_changes (+comment) · approve_video · request_video_changes (+comment)' },
  { method: 'GET', path: '/videos/:id/script', scope: 'read', desc: 'Current script version (?versions=1 for all)' },
  { method: 'PUT', path: '/videos/:id/script', scope: 'write', desc: 'Save edited script { hook, scenes[3], cta } as a new version' },
  { method: 'POST', path: '/videos/:id/script/regenerate', scope: 'write', desc: '{ instructions?, fresh? } — Claude rewrite (~30–90s)' },
  { method: 'GET', path: '/videos/:id/jobs', scope: 'read', desc: 'Job rows for polling pipeline progress' },
  { method: 'POST', path: '/videos/:id/review-links', scope: 'write', desc: '{ kind: script | video } → magic link for a human reviewer' },
  { method: 'DELETE', path: '/videos/:id/review-links/:linkId', scope: 'write', desc: 'Revoke a review link' },
  { method: 'GET', path: '/assets/:assetId', scope: 'read', desc: '{ url } — presigned download, valid 1 hour' },
  { method: 'GET', path: '/brand-assets', scope: 'read', desc: 'Brand assets with download URLs' },
  { method: 'POST', path: '/brand-assets', scope: 'write', desc: 'Two-step upload: presign → PUT file → confirm' },
  { method: 'DELETE', path: '/brand-assets/:id', scope: 'write', desc: 'Delete a brand asset' },
  { method: 'GET', path: '/settings', scope: 'read', desc: 'Saved settings (?voices=1, ?scene_models=1, ?ghl=1 for live pickers)' },
  { method: 'PUT', path: '/settings', scope: 'write', desc: 'Upsert { key: value }' },
];

const TOOLS: { name: string; readOnly: boolean; desc: string }[] = [
  { name: 'list_videos', readOnly: true, desc: 'List videos with status, filter + paging' },
  { name: 'get_video', readOnly: true, desc: 'Full detail incl. script, jobs, asset download URLs, cost' },
  { name: 'create_video', readOnly: false, desc: 'Create a video; optionally generate the first script' },
  { name: 'update_video', readOnly: false, desc: 'Update title/brief/caption/schedule/status/number' },
  { name: 'delete_video', readOnly: false, desc: 'Delete a video and everything belonging to it' },
  { name: 'save_script', readOnly: false, desc: 'Save an edited script as a new version' },
  { name: 'regenerate_script', readOnly: false, desc: 'Claude rewrite, optionally with instructions (slow)' },
  { name: 'video_action', readOnly: false, desc: 'send_for_review / retry_failed / regenerate_scene / regenerate_avatar / re_render' },
  { name: 'review_decision', readOnly: false, desc: 'Approve or request changes on script/video — approval kicks off the pipeline' },
  { name: 'create_review_link', readOnly: false, desc: 'Mint a magic review link for a human reviewer' },
  { name: 'get_asset_url', readOnly: true, desc: 'Fresh presigned download URL for any generated asset' },
  { name: 'list_brand_assets', readOnly: true, desc: 'Logo, outro, BGM, avatar reference' },
  { name: 'get_settings', readOnly: true, desc: 'App settings + live pickers (voices, scene models, social accounts)' },
  { name: 'update_settings', readOnly: false, desc: 'Upsert settings key/values' },
];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3 rounded-[12px] border border-studio bg-studio-card p-5">
      <h2 className="text-sm font-semibold text-studio-sub">{title}</h2>
      {children}
    </section>
  );
}

export default function DocsPage() {
  const base = appUrl();
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <div className="studio-eyebrow mb-2">Developer</div>
        <h1 className="text-2xl font-semibold tracking-tight text-studio-bright">API &amp; MCP</h1>
        <p className="mt-1.5 text-sm text-studio-sub">
          Connect third-party tools and AI agents to the video pipeline. Everything the dashboard
          can do — create videos, write and approve scripts, trigger renders, download finished
          videos — is available programmatically.
        </p>
      </div>

      <Section title="1 · Get an API key">
        <p className="text-xs text-studio-muted">
          Create a key in{' '}
          <Link href="/settings" className="text-studio-accent hover:underline">
            Settings → API keys
          </Link>
          . The full key (<code>ttm_live_…</code>) is shown once — store it like a password. Keys
          are full-access (read + write) or read-only, revocable any time, and act with
          service-role power. Rate limit: 120 requests/minute per key.
        </p>
        <CodeBlock code={`Authorization: Bearer ttm_live_…`} label="Send it on every request:" />
      </Section>

      <Section title="2 · REST API">
        <p className="text-xs text-studio-muted">
          Base URL: <code className="text-studio-text">{base}/api/v1</code> — errors come back as
          JSON <code>{'{ "error": "message" }'}</code> with a meaningful HTTP status.
        </p>
        <CodeBlock
          label="Quick start — create a video and generate the first script:"
          code={`curl -X POST ${base}/api/v1/videos \\
  -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \\
  -d '{"title":"Neck pain myths","topic_brief":"3 myths about neck pain","generate":true}'`}
        />
        <CodeBlock
          label="Approve the script (starts voice → avatar → scenes → render), then poll:"
          code={`curl -X POST ${base}/api/v1/videos/$ID/actions \\
  -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \\
  -d '{"action":"approve_script"}'

curl -H "Authorization: Bearer $KEY" ${base}/api/v1/videos/$ID`}
        />
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-studio font-mono text-[10px] uppercase tracking-wide text-studio-muted">
                <th className="py-1.5 pr-3 font-medium">Method</th>
                <th className="py-1.5 pr-3 font-medium">Path</th>
                <th className="py-1.5 pr-3 font-medium">Scope</th>
                <th className="py-1.5 font-medium">Description</th>
              </tr>
            </thead>
            <tbody>
              {ENDPOINTS.map((e) => (
                <tr key={`${e.method} ${e.path}`} className="border-b border-studio/60 align-top">
                  <td
                    className={`py-1.5 pr-3 font-mono ${
                      e.method === 'GET'
                        ? 'text-emerald-400'
                        : e.method === 'DELETE'
                          ? 'text-red-400'
                          : 'text-studio-accent'
                    }`}
                  >
                    {e.method}
                  </td>
                  <td className="whitespace-nowrap py-1.5 pr-3 font-mono text-studio-text">{e.path}</td>
                  <td className="py-1.5 pr-3">
                    <span className={e.scope === 'write' ? 'text-orange-400' : 'text-emerald-400'}>
                      {e.scope}
                    </span>
                  </td>
                  <td className="py-1.5 text-studio-sub">{e.desc}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-studio-faint">
          Asset download URLs are presigned and expire after 1 hour — re-fetch them, never store
          them.
        </p>
      </Section>

      <Section title="3 · MCP for AI agents (remote)">
        <p className="text-xs text-studio-muted">
          The dashboard serves a Streamable HTTP MCP server at{' '}
          <code className="text-studio-text">{base}/api/mcp</code>, authenticated with the same API
          keys. It exposes 14 tools (below) that run the same code as the REST API.
        </p>
        <CodeBlock
          label="Claude Code:"
          code={`claude mcp add --transport http ttm ${base}/api/mcp \\
  --header "Authorization: Bearer ttm_live_…"`}
        />
        <p className="text-xs text-studio-faint">
          Works with Claude Code, the Claude Agent SDK, and the Messages API{' '}
          <code>mcp_servers</code> block (as <code>authorization_token</code>). claude.ai custom
          connectors expect OAuth and can&apos;t use a static bearer key — use the local stdio
          server below for claude.ai / Claude Desktop.
        </p>
      </Section>

      <Section title="4 · MCP local (stdio)">
        <p className="text-xs text-studio-muted">
          The <code>ttm-video-mcp</code> package (in <code>packages/mcp-stdio</code>) runs locally
          and proxies this dashboard&apos;s REST API. Build once with{' '}
          <code>pnpm --filter ttm-video-mcp build</code>, then add to any MCP client:
        </p>
        <CodeBlock
          label="Claude Code:"
          code={`claude mcp add ttm \\
  -e TTM_API_URL=${base} \\
  -e TTM_API_KEY=ttm_live_… \\
  -- node <repo>/packages/mcp-stdio/dist/index.js`}
        />
        <CodeBlock
          label="Generic MCP client config (Claude Desktop etc.):"
          code={`{
  "mcpServers": {
    "ttm": {
      "command": "node",
      "args": ["<repo>/packages/mcp-stdio/dist/index.js"],
      "env": {
        "TTM_API_URL": "${base}",
        "TTM_API_KEY": "ttm_live_…"
      }
    }
  }
}`}
        />
      </Section>

      <Section title="5 · MCP tools">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-studio font-mono text-[10px] uppercase tracking-wide text-studio-muted">
                <th className="py-1.5 pr-3 font-medium">Tool</th>
                <th className="py-1.5 pr-3 font-medium">Access</th>
                <th className="py-1.5 font-medium">Description</th>
              </tr>
            </thead>
            <tbody>
              {TOOLS.map((t) => (
                <tr key={t.name} className="border-b border-studio/60 align-top">
                  <td className="whitespace-nowrap py-1.5 pr-3 font-mono text-studio-text">{t.name}</td>
                  <td className="py-1.5 pr-3">
                    <span className={t.readOnly ? 'text-emerald-400' : 'text-orange-400'}>
                      {t.readOnly ? 'read' : 'write'}
                    </span>
                  </td>
                  <td className="py-1.5 text-studio-sub">{t.desc}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-studio-faint">Read-only keys can only call the read tools.</p>
      </Section>

      <Section title="6 · Typical agent workflow">
        <ol className="list-decimal space-y-1.5 pl-5 text-xs text-studio-sub">
          <li>
            <code className="text-studio-text">create_video</code> with{' '}
            <code>{'{ title, topic_brief, generate: true }'}</code> — returns the video and the
            first Claude-written script.
          </li>
          <li>
            Refine with <code className="text-studio-text">save_script</code> or{' '}
            <code className="text-studio-text">regenerate_script</code> <code>{'{ instructions }'}</code>.
          </li>
          <li>
            <code className="text-studio-text">video_action</code>{' '}
            <code>{'{ action: "send_for_review" }'}</code>, then either{' '}
            <code className="text-studio-text">create_review_link</code> (human approves) or{' '}
            <code className="text-studio-text">review_decision</code> (agent approves).
          </li>
          <li>
            Script approval starts voice → avatar → B-roll → render automatically. Poll{' '}
            <code className="text-studio-text">get_video</code> until status is{' '}
            <code>video_review</code>.
          </li>
          <li>
            Watch the result via <code className="text-studio-text">get_asset_url</code>, then{' '}
            <code className="text-studio-text">review_decision</code>{' '}
            <code>{'{ kind: "video", decision: "approved" }'}</code> — caption is written and the
            post is scheduled via GoHighLevel.
          </li>
        </ol>
        <p className="text-xs text-studio-faint">
          Pipeline statuses: draft → script_review → voice_generating → avatar_generating →
          scenes_generating → rendering → video_review → approved → scheduled → posted (failures
          land in <code>failed</code> with <code>status_error</code>; use{' '}
          <code>retry_failed</code>).
        </p>
      </Section>
    </div>
  );
}
