# TTM Video Dashboard — REST API & MCP

Third-party integrations and AI agents can drive the full video pipeline: create videos, write and approve scripts, trigger renders, and download finished assets.

There are three ways in, all authenticated by the same API keys:

1. **REST API** — `https://<your-dashboard>/api/v1/*`
2. **Remote MCP (Streamable HTTP)** — `https://<your-dashboard>/api/mcp`
3. **Local stdio MCP** — the `ttm-video-mcp` package (proxies the REST API)

## Authentication

Create a key in **Settings → API keys**. The full key (`ttm_live_…`) is shown **once** — store it like a password. Keys can be full-access (`read` + `write`) or read-only, and can be revoked at any time from Settings.

Send it as a bearer token:

```
Authorization: Bearer ttm_live_…
```

Notes:

- Keys bypass the dashboard's row-level security (they act with service-role power, scoped only by `read`/`write`). Treat them like the Supabase service-role secret.
- Rate limit: best-effort 120 requests/minute per key (429 when exceeded).
- Errors are JSON: `{ "error": "message" }` with a meaningful HTTP status (400/401/403/404/409/429/500).

## The pipeline in one paragraph

A video moves through: `draft` → `script_review` → (approve) → `voice_generating` → `avatar_generating` → `scenes_generating` → `rendering` → `video_review` → (approve) → `approved` → `scheduled` → `posted`. Script generation is synchronous (Claude, ~30–90s); everything after script approval is asynchronous — a worker processes jobs, so **poll `GET /api/v1/videos/:id`** (or the `jobs` endpoint) to watch progress. Failures land in `failed` with `status_error` set; fix and use the `retry_failed` action.

## REST endpoints

Base: `https://<your-dashboard>/api/v1`

| Method | Path | Scope | Description |
|---|---|---|---|
| GET | `/videos?status=&limit=&offset=` | read | List videos |
| POST | `/videos` | write | Create video `{ title, topic_brief?, generate? }` — `generate: true` writes the first script with Claude (slow) |
| GET | `/videos/:id` | read | Full detail: script, jobs, assets (presigned URLs), cost estimate, reviews, timeline |
| PATCH | `/videos/:id` | write | Update `{ status?, video_no?, title?, topic_brief?, caption?, schedule_at? }` |
| DELETE | `/videos/:id` | write | Delete (blocked while actively processing) |
| POST | `/videos/:id/actions` | write | `{ action: send_for_review \| retry_failed \| regenerate_scene (+scene_index) \| regenerate_avatar \| re_render \| approve_script \| request_script_changes \| approve_video \| request_video_changes (+comment) }` |
| GET | `/videos/:id/script` | read | Current script version (`?versions=1` for all) |
| PUT | `/videos/:id/script` | write | Save edited script `{ hook, scenes[3], cta }` as a new version |
| POST | `/videos/:id/script/regenerate` | write | `{ instructions?, fresh? }` — Claude rewrite (slow) |
| GET | `/videos/:id/jobs` | read | Job rows for polling |
| POST | `/videos/:id/review-links` | write | `{ kind: script \| video }` → magic link for a human reviewer |
| DELETE | `/videos/:id/review-links/:linkId` | write | Revoke a review link |
| GET | `/assets/:assetId` | read | `{ url }` — presigned download, valid 1 hour |
| GET | `/brand-assets` | read | Brand assets with download URLs |
| POST | `/brand-assets` | write | Two-step upload: `{ kind, filename }` → `{ uploadUrl, key }`; PUT the file; then `{ kind, confirm: true, key, name, is_default? }` |
| DELETE | `/brand-assets/:id` | write | Delete a brand asset |
| GET | `/settings` | read | Saved settings (`?voices=1`, `?scene_models=1`, `?ghl=1` for live pickers) |
| PUT | `/settings` | write | Upsert `{ key: value }` |

Presigned asset URLs expire after 1 hour — re-fetch them (`GET /assets/:assetId`), never store them.

### Examples

```bash
BASE=https://<your-dashboard>
KEY=ttm_live_…

# List videos in review
curl -H "Authorization: Bearer $KEY" "$BASE/api/v1/videos?status=script_review"

# Create a video and generate the first script (takes ~30-90s)
curl -X POST -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -d '{"title":"Neck pain myths","topic_brief":"3 myths about neck pain adjustments","generate":true}' \
  "$BASE/api/v1/videos"

# Send the script for review, then approve it (kicks off voice → avatar → scenes → render)
curl -X POST -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -d '{"action":"send_for_review"}' "$BASE/api/v1/videos/$ID/actions"
curl -X POST -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -d '{"action":"approve_script"}' "$BASE/api/v1/videos/$ID/actions"

# Poll until rendered, then grab the final video URL
curl -H "Authorization: Bearer $KEY" "$BASE/api/v1/videos/$ID" | jq '.video.status, (.assets[] | select(.kind=="final_video") | .download_url)'
```

## MCP for AI agents

Both MCP servers expose the same 14 tools: `list_videos`, `get_video`, `create_video`, `update_video`, `delete_video`, `save_script`, `regenerate_script`, `video_action`, `review_decision`, `create_review_link`, `get_asset_url`, `list_brand_assets`, `get_settings`, `update_settings`. Read-only keys can only call the read tools.

### Remote (Streamable HTTP) — recommended

The dashboard itself serves MCP at `/api/mcp`. Claude Code:

```bash
claude mcp add --transport http ttm https://<your-dashboard>/api/mcp \
  --header "Authorization: Bearer ttm_live_…"
```

Claude API (Messages `mcp_servers` block) and the Agent SDK work the same way with an `authorization_token`.

> **claude.ai custom connectors:** the connector UI expects OAuth for remote servers and may not accept a static bearer header. Use Claude Code / the API / the stdio server instead; OAuth support is a possible future addition.

### Local stdio

The `packages/mcp-stdio` package proxies the REST API. Build once (`pnpm --filter ttm-video-mcp build`), then:

```bash
claude mcp add ttm \
  -e TTM_API_URL=https://<your-dashboard> \
  -e TTM_API_KEY=ttm_live_… \
  -- node <repo>/packages/mcp-stdio/dist/index.js
```

Or in any MCP client config:

```json
{
  "mcpServers": {
    "ttm": {
      "command": "node",
      "args": ["<repo>/packages/mcp-stdio/dist/index.js"],
      "env": {
        "TTM_API_URL": "https://<your-dashboard>",
        "TTM_API_KEY": "ttm_live_…"
      }
    }
  }
}
```

(If published to npm, `"command": "npx", "args": ["-y", "ttm-video-mcp"]` works too.)

## Typical agent workflow

1. `create_video { title, topic_brief, generate: true }` → returns the video + first script
2. Review/edit: `save_script` or `regenerate_script { instructions }`
3. `video_action { action: "send_for_review" }` then either `create_review_link` (human approves) or `review_decision { kind: "script", decision: "approved" }` (agent approves)
4. Poll `get_video` while the worker generates voice, avatar, B-roll and renders
5. On `video_review`: watch via `get_asset_url`, then `review_decision { kind: "video", decision: "approved" }` → caption + social scheduling via GoHighLevel
