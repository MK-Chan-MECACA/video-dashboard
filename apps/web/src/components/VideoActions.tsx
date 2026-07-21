'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { Video } from '@vd/shared/types';

/** UTC ISO → value for <input type="datetime-local"> in the viewer's timezone. */
function toLocalInputValue(iso: string): string {
  const d = new Date(iso);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

interface LinkRow {
  id: string;
  kind: 'script' | 'video';
  revoked: boolean;
  expires_at: string;
  created_at: string;
}

export function VideoActions({
  video,
  links,
  hasVoiceover = false,
}: {
  video: Video;
  links: LinkRow[];
  /** Video has a generated voiceover — regeneration buttons make sense. */
  hasVoiceover?: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newLink, setNewLink] = useState<string | null>(null);
  const [caption, setCaption] = useState(video.caption ?? '');
  const [scheduleAt, setScheduleAt] = useState(
    video.schedule_at ? toLocalInputValue(video.schedule_at) : '',
  );
  const [metaSaved, setMetaSaved] = useState(false);

  async function act(action: string, extra: Record<string, unknown> = {}) {
    setBusy(action);
    setError(null);
    const res = await fetch(`/api/videos/${video.id}/actions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, ...extra }),
    });
    setBusy(null);
    if (!res.ok) {
      setError(await res.text());
      return false;
    }
    router.refresh();
    return true;
  }

  async function createLink(kind: 'script' | 'video') {
    setBusy(`link-${kind}`);
    setError(null);
    const res = await fetch(`/api/videos/${video.id}/review-links`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind }),
    });
    setBusy(null);
    if (!res.ok) {
      setError(await res.text());
      return;
    }
    const { url } = await res.json();
    setNewLink(url);
    await navigator.clipboard.writeText(url).catch(() => {});
    router.refresh();
  }

  const activeLinks = links.filter((l) => !l.revoked && new Date(l.expires_at) > new Date());

  // Presentational: which review link is the natural next step for this status.
  const videoPhase = [
    'rendering',
    'video_review',
    'video_changes_requested',
    'scheduled',
    'posting',
    'posted',
  ].includes(video.status);
  const linkOrder: Array<'script' | 'video'> = videoPhase
    ? ['video', 'script']
    : ['script', 'video'];
  const primaryLink =
    videoPhase || video.status === 'script_review' ? linkOrder[0] : null;

  return (
    <section className="rounded-[14px] border border-studio-border bg-studio-panel p-5">
      <h2 className="mb-3 text-sm font-semibold text-[#d8cfbf]">Actions</h2>

      <div className="flex flex-wrap gap-2">
        {(video.status === 'draft' || video.status === 'script_changes_requested') && (
          <button
            onClick={() => act('send_for_review')}
            disabled={!!busy}
            className="studio-lift rounded-[8px] bg-studio-accent px-3.5 py-2 text-[12.5px] font-semibold text-studio-on-accent disabled:opacity-50"
          >
            Send script for review
          </button>
        )}
        {linkOrder.map((kind) => (
          <button
            key={kind}
            onClick={() => createLink(kind)}
            disabled={!!busy}
            className={
              primaryLink === kind
                ? 'studio-lift rounded-[8px] bg-studio-accent px-3.5 py-2 text-[12.5px] font-semibold text-studio-on-accent disabled:opacity-50'
                : 'rounded-[8px] border border-studio-border-strong px-3.5 py-2 text-[12.5px] text-[#d8cfbf] transition-colors hover:bg-[#201d18] hover:text-studio-bright disabled:opacity-50'
            }
          >
            Create {kind} review link
          </button>
        ))}
        {video.status === 'failed' && (
          <button
            onClick={() => act('retry_failed')}
            disabled={!!busy}
            className="studio-lift rounded-[8px] bg-red-800 px-3.5 py-2 text-[12.5px] font-semibold hover:bg-red-700 disabled:opacity-50"
          >
            Retry failed jobs
          </button>
        )}
        {hasVoiceover &&
          ![
            'script_generating',
            'voice_generating',
            'avatar_generating',
            'scenes_generating',
            'rendering',
            'scheduled',
            'posted',
          ].includes(video.status) && (
          <>
            <button
              onClick={() => act('regenerate_voice')}
              disabled={!!busy}
              className="rounded-[8px] border border-studio-border-strong px-3.5 py-2 text-[12.5px] text-[#c9c0b0] transition-colors hover:bg-[#201d18] hover:text-studio-bright disabled:opacity-50"
              title="Re-runs TTS from the current script, then regenerates the avatar and re-renders. Keeps existing B-roll scenes."
            >
              Regenerate voice + avatar
            </button>
            <button
              onClick={() => act('regenerate_avatar')}
              disabled={!!busy}
              className="rounded-[8px] border border-studio-border-strong px-3.5 py-2 text-[12.5px] text-[#c9c0b0] transition-colors hover:bg-[#201d18] hover:text-studio-bright disabled:opacity-50"
            >
              Regenerate avatar
            </button>
            {[1, 2, 3].map((i) => (
              <button
                key={i}
                onClick={() => act('regenerate_scene', { scene_index: i })}
                disabled={!!busy}
                className="rounded-[8px] border border-studio-border-strong px-3.5 py-2 text-[12.5px] text-[#c9c0b0] transition-colors hover:bg-[#201d18] hover:text-studio-bright disabled:opacity-50"
              >
                Regen scene {i}
              </button>
            ))}
            <button
              onClick={() => act('re_render')}
              disabled={!!busy}
              className="rounded-[8px] border border-studio-border-strong px-3.5 py-2 text-[12.5px] text-[#c9c0b0] transition-colors hover:bg-[#201d18] hover:text-studio-bright disabled:opacity-50"
            >
              Re-render
            </button>
          </>
        )}
      </div>

      <p className="mt-3 text-[11px] leading-normal text-studio-muted">
        Approval happens through a review link — creating one copies it to your clipboard.
        Regeneration is available in review and after approval (until the post is scheduled).
        After editing the script, use &ldquo;Regenerate voice + avatar&rdquo; to re-voice it —
        existing B-roll scenes are kept.
      </p>

      {newLink && (
        <p className="mt-3 break-all rounded-[8px] bg-studio-code p-2 text-xs text-emerald-300">
          Link copied to clipboard: {newLink}
        </p>
      )}

      {activeLinks.length > 0 && (
        <div className="mt-3 text-xs text-studio-sub">
          Active review links: {activeLinks.map((l) => l.kind).join(', ')} (tokens are only shown
          once at creation)
        </div>
      )}

      <div className="mt-4 border-t border-[#201d18] pt-4">
        <label className="mb-[7px] block text-xs text-studio-muted">
          Post caption <span className="text-studio-faint">— written by Claude after approval; override here</span>
        </label>
        <textarea
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
          rows={4}
          placeholder="Generated automatically after video approval — you can override it here."
          className="w-full rounded-[10px] border border-studio-border-strong bg-studio-inset px-3 py-2.5 text-[13px] leading-normal"
        />
        <label className="mb-[7px] mt-3.5 block text-xs text-studio-muted">
          Schedule time <span className="text-studio-faint">— defaults to 7 PM MYT next day</span>
        </label>
        <div className="flex flex-wrap items-center gap-2.5">
          <input
            type="datetime-local"
            value={scheduleAt}
            onChange={(e) => setScheduleAt(e.target.value)}
            className="rounded-[9px] border border-studio-border-strong bg-studio-inset px-3 py-2 font-mono text-[13px] text-[#d8cfbf]"
          />
          <button
            onClick={async () => {
              setMetaSaved(false);
              const ok = await act('update_meta', {
                caption: caption || null,
                schedule_at: scheduleAt ? new Date(scheduleAt).toISOString() : null,
              });
              if (ok) setMetaSaved(true);
            }}
            disabled={!!busy}
            className="rounded-[9px] border border-studio-border-strong px-3.5 py-2 text-[12.5px] text-[#c9c0b0] transition-colors hover:bg-[#201d18] hover:text-studio-bright disabled:opacity-50"
          >
            Save caption & schedule
          </button>
          {metaSaved && <span className="text-xs text-emerald-300">Saved ✓</span>}
        </div>
        <p className="mt-2 text-[11px] leading-normal text-studio-muted">
          {video.ghl_post_id
            ? `Scheduled in GoHighLevel (post ${video.ghl_post_id}).`
            : 'Saving only stores the caption and time — the post is created in GoHighLevel automatically once the video is approved through its review link.'}
        </p>
      </div>

      {error && <p className="mt-3 text-sm text-red-400">{error}</p>}
    </section>
  );
}
