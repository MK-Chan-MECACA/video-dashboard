# Setup Guide

One-time provisioning, in order. Budget ~1 hour.

## 1. Supabase (database + operator login)

1. Create a project at [supabase.com](https://supabase.com) (region: Singapore).
2. SQL Editor → paste and run each file in `supabase/migrations/` in order (`0001_init.sql`, `0002_app_settings.sql`).
   (Or with the CLI: `supabase link --project-ref <ref>` then `supabase db push`.)
3. Authentication → Users → **Add user** → create your operator account (email + password). Disable public signups (Authentication → Providers → Email → turn off "Allow new users to sign up").
4. Copy into `.env`: Project URL → `NEXT_PUBLIC_SUPABASE_URL`, anon key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`, service role key → `SUPABASE_SERVICE_ROLE_KEY`.
5. Settings → Database → Connection string (Session pooler) → `DATABASE_URL` (used by the worker).

## 2. Cloudflare R2 (media storage)

1. Cloudflare dashboard → R2 → **Create bucket** (any name, e.g. `my-media`) → `R2_BUCKET`.
2. Bucket → Settings → Public access → enable (custom domain or `r2.dev` URL) → `R2_PUBLIC_BASE_URL`.
   Public access is required so GoHighLevel and the social platforms can fetch the final video. Keys are unguessable UUIDs.
3. R2 → Manage API tokens → Create token (Object Read & Write, scoped to the bucket) → `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`. Account id → `R2_ACCOUNT_ID`.

## 3. API keys

- **Anthropic**: console.anthropic.com → `ANTHROPIC_API_KEY`.
- **HeyGen**: app.heygen.com → Settings → API (needs the paid API plan) → `HEYGEN_API_KEY`.
- **WaveSpeed**: wavespeed.ai → dashboard → API key → `WAVESPEED_API_KEY`. Webhooks page → create webhook secret → `WAVESPEED_WEBHOOK_SECRET`.
- **GoHighLevel**: Sub-account → Settings → Private Integrations → create with Social Planner read/write scopes → `GHL_PRIVATE_TOKEN`. Location ID → `GHL_LOCATION_ID`.
  - Connect your brand's social accounts (TikTok, Instagram, Facebook, YouTube, ...): Marketing → Social Planner → Settings → Connect.
  - Then in the dashboard Settings page click "List connected social accounts" and put the ids you want to post to (comma-separated) in `GHL_SOCIAL_ACCOUNT_IDS`. `GHL_USER_ID` = your GHL user id (Settings → My Staff → your profile URL contains it).

## 4. Deploy web app (Vercel)

```bash
cd apps/web && vercel link
```
- Root directory: `apps/web`; framework: Next.js. Vercel auto-detects the pnpm workspace.
- Add every env var from `.env.example` (except `DATABASE_URL`/`WORKER_CONCURRENCY`, which are worker-only).
- Set `APP_URL` to the deployed URL (e.g. `https://your-project.vercel.app`) — used for review links + WaveSpeed webhooks.

## 5. Deploy worker (Railway)

1. railway.app → New Project → Deploy from repo, root `apps/worker` (Dockerfile build — includes ffmpeg).
2. Add env vars: `DATABASE_URL`, `ANTHROPIC_API_KEY`, `HEYGEN_API_KEY`, `WAVESPEED_API_KEY`, all `R2_*`, all `GHL_*`, `APP_URL`, `WORKER_CONCURRENCY=3`.
3. No public networking needed — the worker only makes outbound calls.

## 6. First run checklist

1. Log in at `APP_URL` with the Supabase operator account.
2. **Settings** → set your brand name, customize the script + caption prompts, then upload brand assets: avatar reference (silent talking-pose video of the presenter), logo PNG, outro card (1080×1920), BGM MP3 → mark each as default.
3. **Settings** → Load English voices → pick + save the HeyGen voice.
4. Create a test video → generate script → create a script review link → open it in an incognito window → approve.
5. Watch the pipeline: voiceover → avatar → scenes → render (worker logs in Railway). Assets appear on the video page as they finish.
6. Create a video review link → approve → check Social Planner in GHL for the scheduled post on each connected platform. **Verify the first post actually publishes** (e.g. personal TikTok profiles may use notification-based posting).

## Cost expectations (~35 videos/month, 75s average)

~$5.10/video in WaveSpeed credits (avatar $4.50 + 3 scenes $0.58), ≈ $230/mo with regeneration buffer, plus Railway $5–10, Supabase $0–25, Vercel $0–20, R2 ~$2, Claude ~$3. HeyGen + GHL on existing plans.
