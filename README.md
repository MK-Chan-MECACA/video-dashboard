# Video Dashboard

Open-source AI TikTok video production pipeline for a presenter-led brand — originally built for a Malaysian clinic and now brand-agnostic. Automates the full flow:

```
Claude script → client approves (magic link) → HeyGen voiceover
→ WaveSpeed InfiniteTalk avatar + 3 Seedance B-roll scenes
→ render: FFmpeg or HyperFrames (logo, outro, BGM, burned-in subtitles)
→ client approves final video (magic link)
→ scheduled TikTok post via GoHighLevel with Claude-written caption
```

Everything brand-specific lives in the dashboard's Settings page — brand name, script system prompt, caption prompt, voice, brand assets (presenter reference video, logo, outro card, BGM), and the render layout template. Point it at your own accounts and it produces videos for your brand.

## Structure

| Path | What it is |
|---|---|
| `apps/web` | Next.js dashboard on Vercel — operator UI, magic-link review pages, API routes, WaveSpeed webhook |
| `apps/worker` | Always-on Node worker (Railway or any Docker host) — job queue, HeyGen/WaveSpeed calls, render, GHL posting |
| `packages/shared` | Types, pipeline state machine, prompts, API clients shared by both |
| `supabase/migrations` | Postgres schema (videos, scripts, assets, jobs, reviews, posts) |

See [SETUP.md](SETUP.md) for provisioning (Supabase, R2, Vercel, Railway) and first-run steps.

## Local development

```bash
pnpm install
cp .env.example .env           # fill in keys
pnpm dev                       # web on :3000
pnpm dev:worker                # pipeline worker (needs ffmpeg installed)
```

## How a video flows

1. **New Video** → Claude generates hook + 3 scenes (each with a B-roll prompt) + CTA, using the script system prompt you customized in Settings.
2. Edit/regenerate in the script editor, then **Send for review** and share a script review link (WhatsApp-able, no login).
3. On approval the pipeline runs automatically: HeyGen TTS (word timestamps drive subtitles + scene timing) → InfiniteTalk avatar → 3 B-roll scenes → render (FFmpeg filtergraph or an [HyperFrames](https://github.com/heygen-com/hyperframes) HTML composition, selectable in Settings).
4. Share the video review link. On approval, a caption is generated and the post is scheduled to TikTok via GoHighLevel (default: next day 7 PM local, override per video).

## Making it yours

After deploying, open **Settings** and:

- Set your **brand name** (drives the header badge, favicon, and review-page heading).
- Customize the **script system prompt** — fill in the ABOUT YOUR BRAND block with your presenter, audience, offer, and boundaries.
- Customize the **caption prompt** with your hashtags and local tags.
- Upload **brand assets**: a silent talking-pose reference video of your presenter, logo PNG, 1080×1920 outro card, and BGM.
- Pick a **HeyGen voice** and adjust the **render template** (logo position, subtitle style, presenter bubble).

## License

[MIT](LICENSE)
