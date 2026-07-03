# @vd/worker

Always-on Node worker for the video pipeline. It claims jobs from the
Postgres `jobs` table (`FOR UPDATE SKIP LOCKED`), calls HeyGen / WaveSpeed,
stores outputs in Cloudflare R2, renders the final vertical video with system
ffmpeg, and schedules TikTok posts via GoHighLevel.

## Run locally

```bash
pnpm install
pnpm --filter @vd/worker dev      # tsx watch src/index.ts
```

Requires `ffmpeg`/`ffprobe` on PATH (ffmpeg must include libass for burned
subtitles) and the env vars below.

## Env vars

From the repo root `.env.example`:

- `DATABASE_URL` — direct Postgres connection (Supabase pooler "session"
  string). The worker never uses the Supabase JS client or the anon key.
- `HEYGEN_API_KEY`, and optionally `HEYGEN_VOICE_ID` — default TTS voice used
  when a `tts` job payload has no `voice_id` (not in `.env.example`; set it on
  the worker service).
- `WAVESPEED_API_KEY`
- `GHL_PRIVATE_TOKEN`, `GHL_LOCATION_ID`, `GHL_TIKTOK_ACCOUNT_ID`, `GHL_USER_ID`
- `ANTHROPIC_API_KEY` — caption generation
- `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`,
  `R2_PUBLIC_BASE_URL`
- `APP_URL` — public web app URL; WaveSpeed webhooks go to
  `${APP_URL}/api/webhooks/wavespeed`
- `WORKER_CONCURRENCY` — max simultaneous jobs (default 3)

## How it works

Every 3s the loop:

1. Claims up to `WORKER_CONCURRENCY` queued jobs in a `FOR UPDATE SKIP LOCKED`
   transaction and dispatches them (`tts`, `avatar`, `scene`, `render`,
   `generate_caption`, `ghl_post`; `generate_script` is a no-op — the web app
   generates scripts synchronously).
2. Poll backstop: `awaiting_external` jobs whose webhook already delivered a
   terminal status — or that haven't been touched in >60s — are checked
   against WaveSpeed and finalized (download to R2, asset row, advance the
   video, enqueue `render` when the avatar + 3 scene clips are in).
3. Every 6h it asks GHL about `posts` rows still `scheduled` and flips them to
   `published`/`failed` (video → `posted`).

Failures retry with exponential backoff (`2^attempts * 30s`); after
`max_attempts` the job and the video are marked failed with the error. Every
state change is written to `pipeline_events`.

## Fonts (`fonts/`)

Subtitles use **Montserrat ExtraBold**. Montserrat is not available as a
Debian package, so drop the font file(s) into this directory, e.g.:

```
apps/worker/fonts/Montserrat-ExtraBold.ttf
```

(Download from Google Fonts.) The render step passes this directory to the
ffmpeg `subtitles` filter as `fontsdir`. If the font is missing, libass falls
back to **DejaVu Sans Bold**, which is installed in the Docker image
(`fonts-dejavu-core`).

## Deploy (Railway)

- Create a Railway service from this repo. `apps/worker/railway.json` points
  the build at `apps/worker/Dockerfile`; keep the service **root directory at
  the repo root** so the Docker build context includes the pnpm workspace
  (`packages/shared`). If Railway doesn't pick up the config file
  automatically, set "Config file path" to `apps/worker/railway.json`.
- Set all env vars above on the service.
- No public networking needed — the worker only makes outbound calls.
  WaveSpeed webhooks hit the web app; the worker's poll backstop covers
  missed webhooks.
- Railway sends SIGTERM on redeploy; the worker drains in-flight jobs before
  exiting.

## Tests

```bash
pnpm --filter @vd/worker test        # pure filtergraph/ASS assertions
pnpm --filter @vd/worker typecheck
```
