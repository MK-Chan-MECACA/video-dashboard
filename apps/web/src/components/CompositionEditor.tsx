'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Video } from '@vd/shared/types';

/**
 * HyperFrames composition editor: code editor + live <hyperframes-player>
 * preview + clickable timeline, for adjusting the final render by hand.
 * Edits are saved back to R2 and re-rendered verbatim by the worker
 * (action: render_composition).
 */

// ponytail: player pinned to 0.7.61 (first version that pins its injected core
// runtime); the render CLI is hyperframes@0.7.26 — bump the worker dep to
// converge if preview ever visibly drifts from renders.
const PLAYER_SRC = 'https://cdn.jsdelivr.net/npm/hyperframes@0.7.61/dist/hyperframes-player.global.js';

interface PlayerElement extends HTMLElement {
  currentTime: number;
  duration: number;
}

interface TimelineClip {
  label: string;
  start: number;
  duration: number;
  track: number;
}

const TRACK_LABELS: Record<number, string> = {
  0: 'avatar',
  1: 'b-roll',
  2: 'bubble',
  3: 'logo',
  4: 'captions',
  5: 'outro',
  10: 'voiceover',
  11: 'bgm',
};

/** Per-track clip colors so the timeline reads at a glance. */
const TRACK_COLORS: Record<number, { bg: string; border: string; text: string }> = {
  0: { bg: 'rgba(59,130,246,0.25)', border: 'rgba(59,130,246,0.6)', text: '#93c5fd' }, // avatar - blue
  1: { bg: 'rgba(168,85,247,0.25)', border: 'rgba(168,85,247,0.6)', text: '#d8b4fe' }, // b-roll - purple
  2: { bg: 'rgba(20,184,166,0.25)', border: 'rgba(20,184,166,0.6)', text: '#5eead4' }, // bubble - teal
  3: { bg: 'rgba(249,115,22,0.25)', border: 'rgba(249,115,22,0.6)', text: '#fdba74' }, // logo - orange
  4: { bg: 'rgba(233,185,73,0.22)', border: 'rgba(233,185,73,0.55)', text: '#e9b949' }, // captions - gold
  5: { bg: 'rgba(244,63,94,0.25)', border: 'rgba(244,63,94,0.6)', text: '#fda4af' }, // outro - rose
  10: { bg: 'rgba(34,197,94,0.25)', border: 'rgba(34,197,94,0.6)', text: '#86efac' }, // voiceover - green
  11: { bg: 'rgba(34,197,94,0.14)', border: 'rgba(34,197,94,0.4)', text: '#4ade80' }, // bgm - dim green
};
const FALLBACK_COLOR = { bg: 'rgba(163,154,140,0.2)', border: 'rgba(163,154,140,0.5)', text: '#a39a8c' };

function parseTimeline(html: string): { total: number; clips: TimelineClip[] } {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const root = doc.querySelector('[data-composition-id]');
  const total = Number(root?.getAttribute('data-duration')) || 0;
  const clips: TimelineClip[] = [];
  root?.querySelectorAll('[data-start][data-duration]').forEach((el) => {
    if (el === root) return;
    clips.push({
      label: el.id || el.tagName.toLowerCase(),
      start: Number(el.getAttribute('data-start')) || 0,
      duration: Number(el.getAttribute('data-duration')) || 0,
      track: Number(el.getAttribute('data-track-index')) || 0,
    });
  });
  return { total, clips };
}

export function CompositionEditor({
  video,
  initialHtml,
  stale,
}: {
  video: Video;
  initialHtml: string;
  stale: boolean;
}) {
  const router = useRouter();
  const playerRef = useRef<PlayerElement | null>(null);
  const [playerLoaded, setPlayerLoaded] = useState(false);
  const [html, setHtml] = useState(initialHtml);
  const [savedHtml, setSavedHtml] = useState(initialHtml);
  const [appliedHtml, setAppliedHtml] = useState(initialHtml);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const dirty = html !== savedHtml;

  // Relative "assets/..." srcs resolve through the manifest-backed API route.
  const withBase = (raw: string): string =>
    raw.replace(
      /<head([^>]*)>/i,
      `<head$1><base href="${typeof window === 'undefined' ? '' : window.location.origin}/api/videos/${video.id}/hf-assets/">`,
    );

  useEffect(() => {
    if (customElements.get('hyperframes-player')) {
      setPlayerLoaded(true);
      return;
    }
    const script = document.createElement('script');
    script.src = PLAYER_SRC;
    script.onload = () => setPlayerLoaded(true);
    script.onerror = () => setError('Failed to load the HyperFrames player script');
    document.head.appendChild(script);
  }, []);

  useEffect(() => {
    const el = playerRef.current;
    if (!el || !playerLoaded) return;
    const onReady = (e: Event) => setDuration((e as CustomEvent).detail?.duration ?? 0);
    const onTime = (e: Event) => setCurrentTime((e as CustomEvent).detail?.currentTime ?? 0);
    el.addEventListener('ready', onReady);
    el.addEventListener('timeupdate', onTime);
    el.setAttribute('srcdoc', withBase(appliedHtml));
    return () => {
      el.removeEventListener('ready', onReady);
      el.removeEventListener('timeupdate', onTime);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playerLoaded, appliedHtml]);

  const timeline = useMemo(() => parseTimeline(appliedHtml), [appliedHtml]);
  const tracks = useMemo(() => {
    const byTrack = new Map<number, TimelineClip[]>();
    for (const c of timeline.clips) {
      byTrack.set(c.track, [...(byTrack.get(c.track) ?? []), c]);
    }
    return [...byTrack.entries()].sort((a, b) => a[0] - b[0]);
  }, [timeline]);

  async function save(): Promise<boolean> {
    setBusy('save');
    setError(null);
    const res = await fetch(`/api/videos/${video.id}/composition`, {
      method: 'PUT',
      headers: { 'Content-Type': 'text/html' },
      body: html,
    });
    setBusy(null);
    if (!res.ok) {
      setError(await res.text());
      return false;
    }
    setSavedHtml(html);
    return true;
  }

  async function act(action: string): Promise<boolean> {
    setBusy(action);
    setError(null);
    const res = await fetch(`/api/videos/${video.id}/actions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action }),
    });
    setBusy(null);
    if (!res.ok) {
      setError(await res.text());
      return false;
    }
    return true;
  }

  async function saveAndRender() {
    if (!(await save())) return;
    if (await act('render_composition')) router.push(`/videos/${video.id}`);
  }

  async function regenerateFromTemplate() {
    if (!confirm('Discard manual edits and regenerate the composition from the template?')) return;
    if (await act('re_render')) router.push(`/videos/${video.id}`);
  }

  const seek = (t: number) => {
    const el = playerRef.current;
    if (el) el.currentTime = t;
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Link href={`/videos/${video.id}`} className="text-sm text-studio-sub hover:text-studio-bright">
          ← Back to video
        </Link>
        <h1 className="text-sm font-semibold text-studio-bright">
          Video editor — V{video.video_no} {video.title}
        </h1>
        {dirty && <span className="text-xs text-studio-accent">unsaved changes</span>}
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => setAppliedHtml(html)}
            disabled={busy != null}
            className="rounded-[8px] border border-studio-border-strong px-3 py-1.5 text-xs hover:border-studio-border-hover disabled:opacity-50"
          >
            Apply to preview
          </button>
          <button
            onClick={save}
            disabled={busy != null || !dirty}
            className="rounded-[8px] border border-studio-border-strong px-3 py-1.5 text-xs hover:border-studio-border-hover disabled:opacity-50"
          >
            {busy === 'save' ? 'Saving…' : 'Save'}
          </button>
          <button
            onClick={saveAndRender}
            disabled={busy != null}
            className="rounded-[8px] bg-studio-accent px-3 py-1.5 text-xs font-semibold text-studio-on-accent disabled:opacity-50"
          >
            {busy === 'render_composition' ? 'Queuing…' : 'Save & re-render'}
          </button>
          <button
            onClick={regenerateFromTemplate}
            disabled={busy != null}
            className="rounded-[8px] border border-studio-border-strong px-3 py-1.5 text-xs text-studio-sub hover:border-studio-border-hover disabled:opacity-50"
          >
            Regenerate from template
          </button>
        </div>
      </div>

      {stale && (
        <div className="rounded-[8px] border border-amber-800 bg-amber-950 px-3 py-2 text-xs text-amber-200">
          Newer avatar/scene/voiceover assets exist — this composition references older media.
          Regenerate from template to pick them up.
        </div>
      )}
      {error && (
        <div className="rounded-[8px] border border-red-900 bg-red-950 px-3 py-2 text-xs text-red-200">
          {error}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <textarea
          value={html}
          onChange={(e) => setHtml(e.target.value)}
          spellCheck={false}
          className="h-[70vh] w-full resize-none rounded-[12px] border border-studio-border-strong bg-studio-code p-3 font-mono text-xs leading-5 text-studio-text"
        />
        <div className="space-y-3">
          <div className="mx-auto aspect-[9/16] w-full max-w-[360px] overflow-hidden rounded-[12px] border border-studio-border bg-black">
            {playerLoaded ? (
              // @ts-expect-error custom element
              <hyperframes-player
                ref={playerRef}
                controls=""
                width="1080"
                height="1920"
                style={{ display: 'block', width: '100%', height: '100%' }}
              />
            ) : (
              <div className="flex h-full items-center justify-center text-xs text-studio-faint">
                Loading player…
              </div>
            )}
          </div>
          <p className="text-center text-xs text-studio-faint">
            {currentTime.toFixed(1)}s / {(duration || timeline.total).toFixed(1)}s
          </p>
        </div>
      </div>

      {timeline.total > 0 && (
        <div className="space-y-1 rounded-[12px] border border-studio-border bg-studio-card p-3">
          {tracks.map(([trackIndex, clips]) => {
            const color = TRACK_COLORS[trackIndex] ?? FALLBACK_COLOR;
            return (
            <div key={trackIndex} className="flex items-center gap-2">
              <span className="w-20 shrink-0 text-right text-[10px]" style={{ color: color.text }}>
                {TRACK_LABELS[trackIndex] ?? `track ${trackIndex}`}
              </span>
              <div className="relative h-6 flex-1 rounded-[4px] bg-studio-panel">
                {clips.map((c, i) => (
                  <button
                    key={i}
                    onClick={() => seek(c.start)}
                    title={`${c.label} · ${c.start.toFixed(1)}s – ${(c.start + c.duration).toFixed(1)}s`}
                    style={{
                      left: `${(c.start / timeline.total) * 100}%`,
                      width: `${Math.max((c.duration / timeline.total) * 100, 0.5)}%`,
                      background: color.bg,
                      borderColor: color.border,
                      color: color.text,
                    }}
                    className="absolute top-0.5 h-5 overflow-hidden rounded-[3px] border px-1 text-left text-[9px] leading-5 brightness-100 hover:brightness-150"
                  >
                    {c.label}
                  </button>
                ))}
                <div
                  className="pointer-events-none absolute top-0 h-6 w-px bg-studio-accent"
                  style={{
                    left: `${(Math.min(currentTime, timeline.total) / timeline.total) * 100}%`,
                  }}
                />
              </div>
            </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
