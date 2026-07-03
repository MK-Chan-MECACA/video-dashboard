'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { Video } from '@vd/shared/types';

interface LinkRow {
  id: string;
  kind: 'script' | 'video';
  revoked: boolean;
  expires_at: string;
  created_at: string;
}

export function VideoActions({ video, links }: { video: Video; links: LinkRow[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newLink, setNewLink] = useState<string | null>(null);
  const [caption, setCaption] = useState(video.caption ?? '');
  const [scheduleAt, setScheduleAt] = useState(
    video.schedule_at ? video.schedule_at.slice(0, 16) : '',
  );

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

  return (
    <section className="rounded-lg border border-neutral-800 bg-neutral-900 p-4">
      <h2 className="mb-3 text-sm font-semibold text-neutral-300">Actions</h2>

      <div className="flex flex-wrap gap-2">
        {(video.status === 'draft' || video.status === 'script_changes_requested') && (
          <button
            onClick={() => act('send_for_review')}
            disabled={!!busy}
            className="rounded bg-yellow-400 px-3 py-1.5 text-sm font-semibold text-black hover:bg-yellow-300 disabled:opacity-50"
          >
            Send script for review
          </button>
        )}
        <button
          onClick={() => createLink('script')}
          disabled={!!busy}
          className="rounded border border-neutral-700 px-3 py-1.5 text-sm hover:bg-neutral-800 disabled:opacity-50"
        >
          Create script review link
        </button>
        <button
          onClick={() => createLink('video')}
          disabled={!!busy}
          className="rounded border border-neutral-700 px-3 py-1.5 text-sm hover:bg-neutral-800 disabled:opacity-50"
        >
          Create video review link
        </button>
        {video.status === 'failed' && (
          <button
            onClick={() => act('retry_failed')}
            disabled={!!busy}
            className="rounded bg-red-800 px-3 py-1.5 text-sm font-semibold hover:bg-red-700 disabled:opacity-50"
          >
            Retry failed jobs
          </button>
        )}
        {(video.status === 'video_changes_requested' || video.status === 'video_review') && (
          <>
            <button
              onClick={() => act('regenerate_avatar')}
              disabled={!!busy}
              className="rounded border border-neutral-700 px-3 py-1.5 text-sm hover:bg-neutral-800 disabled:opacity-50"
            >
              Regenerate avatar
            </button>
            {[1, 2, 3].map((i) => (
              <button
                key={i}
                onClick={() => act('regenerate_scene', { scene_index: i })}
                disabled={!!busy}
                className="rounded border border-neutral-700 px-3 py-1.5 text-sm hover:bg-neutral-800 disabled:opacity-50"
              >
                Regen scene {i}
              </button>
            ))}
            <button
              onClick={() => act('re_render')}
              disabled={!!busy}
              className="rounded border border-neutral-700 px-3 py-1.5 text-sm hover:bg-neutral-800 disabled:opacity-50"
            >
              Re-render
            </button>
          </>
        )}
      </div>

      {newLink && (
        <p className="mt-3 break-all rounded bg-neutral-950 p-2 text-xs text-emerald-300">
          Link copied to clipboard: {newLink}
        </p>
      )}

      {activeLinks.length > 0 && (
        <div className="mt-3 text-xs text-neutral-400">
          Active review links: {activeLinks.map((l) => l.kind).join(', ')} (tokens are only shown
          once at creation)
        </div>
      )}

      <div className="mt-4 space-y-2 border-t border-neutral-800 pt-4">
        <label className="block text-xs text-neutral-400">TikTok caption</label>
        <textarea
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
          rows={4}
          placeholder="Generated automatically after video approval — you can override it here."
          className="w-full rounded border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm"
        />
        <label className="block text-xs text-neutral-400">Schedule time (defaults to 7 PM MYT next day)</label>
        <input
          type="datetime-local"
          value={scheduleAt}
          onChange={(e) => setScheduleAt(e.target.value)}
          className="rounded border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm"
        />
        <div>
          <button
            onClick={() =>
              act('update_meta', {
                caption: caption || null,
                schedule_at: scheduleAt ? new Date(scheduleAt).toISOString() : null,
              })
            }
            disabled={!!busy}
            className="rounded border border-neutral-700 px-3 py-1.5 text-sm hover:bg-neutral-800 disabled:opacity-50"
          >
            Save caption & schedule
          </button>
        </div>
      </div>

      {error && <p className="mt-3 text-sm text-red-400">{error}</p>}
    </section>
  );
}
