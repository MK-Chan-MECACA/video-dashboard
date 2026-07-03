'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  SCENE_MODEL_OPTIONS,
  sceneCode,
  type Script,
  type ScriptVersion,
  type Video,
} from '@vd/shared/types';
import { StatusBadge } from '@/components/StatusBadge';

interface CommentRow {
  id: string;
  section_key: string;
  author_name: string;
  body: string;
}

const EMPTY: Script = {
  hook: '',
  cta: '',
  scenes: [1, 2, 3].map((i) => ({
    index: i,
    voiceover: '',
    broll_prompt: '',
    model_path: SCENE_MODEL_OPTIONS[0].value,
  })),
};

export function ScriptEditor({
  video,
  versions,
  comments,
}: {
  video: Video;
  versions: ScriptVersion[];
  comments: CommentRow[];
}) {
  const router = useRouter();
  const current = versions.find((v) => v.id === video.current_script_version_id) ?? versions[0];
  const [script, setScript] = useState<Script>(
    current ? { hook: current.hook, cta: current.cta, scenes: current.scenes } : EMPTY,
  );
  const [instructions, setInstructions] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Live text-to-video catalog from WaveSpeed; static list is the fallback.
  const [modelOptions, setModelOptions] = useState<{ value: string; label: string }[]>(
    SCENE_MODEL_OPTIONS,
  );

  useEffect(() => {
    fetch('/api/settings?scene_models=1')
      .then((r) => (r.ok ? r.json() : null))
      .then((models: { value: string; label: string }[] | null) => {
        if (models?.length) setModelOptions(models);
      })
      .catch(() => {});
  }, []);

  // Keep any model already saved on a scene selectable even if it left the catalog.
  const allModelOptions = (() => {
    const known = new Set(modelOptions.map((m) => m.value));
    const extras = script.scenes
      .map((s) => s.model_path)
      .filter((v) => v && !known.has(v))
      .map((v) => ({ value: v, label: `${v} (legacy)` }));
    return [...modelOptions, ...extras];
  })();

  const wordCount = [script.hook, ...script.scenes.map((s) => s.voiceover), script.cta]
    .join(' ')
    .split(/\s+/)
    .filter(Boolean).length;

  function setScene(i: number, patch: Partial<Script['scenes'][number]>) {
    setScript((s) => ({
      ...s,
      scenes: s.scenes.map((sc) => (sc.index === i ? { ...sc, ...patch } : sc)),
    }));
  }

  async function save() {
    setBusy('save');
    setError(null);
    const res = await fetch(`/api/videos/${video.id}/script`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(script),
    });
    setBusy(null);
    if (!res.ok) return setError(await res.text());
    router.refresh();
  }

  async function regenerate(fresh: boolean) {
    setBusy('regen');
    setError(null);
    const res = await fetch(`/api/videos/${video.id}/script`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ instructions, fresh }),
    });
    setBusy(null);
    if (!res.ok) return setError(await res.text());
    router.refresh();
    // pull the fresh version into the editor
    window.location.reload();
  }

  async function sendForReview() {
    setBusy('review');
    setError(null);
    await save();
    const res = await fetch(`/api/videos/${video.id}/actions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'send_for_review' }),
    });
    setBusy(null);
    if (!res.ok) return setError(await res.text());
    router.push(`/videos/${video.id}`);
    router.refresh();
  }

  const commentsFor = (key: string) => comments.filter((c) => c.section_key === key);

  const Section = ({
    label,
    sectionKey,
    value,
    onChange,
    rows = 2,
  }: {
    label: string;
    sectionKey: string;
    value: string;
    onChange: (v: string) => void;
    rows?: number;
  }) => (
    <div>
      <label className="mb-1 block text-sm font-semibold text-yellow-400">{label}</label>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={rows}
        className="w-full rounded border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm"
      />
      {commentsFor(sectionKey).map((c) => (
        <p key={c.id} className="mt-1 rounded bg-orange-950 px-2 py-1 text-xs text-orange-200">
          💬 <b>{c.author_name}:</b> {c.body}
        </p>
      ))}
    </div>
  );

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div className="flex items-center gap-3">
        <Link href={`/videos/${video.id}`} className="text-sm text-neutral-400 hover:text-white">
          ← {video.video_no ? `V${video.video_no} · ` : ''}{video.title}
        </Link>
        <StatusBadge status={video.status} />
        <span className="ml-auto text-xs text-neutral-500">
          {current ? `v${current.version} (${current.created_by})` : 'no version yet'} ·{' '}
          {wordCount} words spoken
        </span>
      </div>

      <div className="space-y-4 rounded-lg border border-neutral-800 bg-neutral-900 p-5">
        <Section
          label="Hook"
          sectionKey="hook"
          value={script.hook}
          onChange={(v) => setScript((s) => ({ ...s, hook: v }))}
        />
        {script.scenes.map((scene) => (
          <div key={scene.index} className="space-y-2 rounded border border-neutral-800 p-3">
            <Section
              label={`${sceneCode(video.video_no, scene.index)} — voiceover`}
              sectionKey={`scene_${scene.index}`}
              value={scene.voiceover}
              onChange={(v) => setScene(scene.index, { voiceover: v })}
            />
            <div>
              <label className="mb-1 block text-xs text-neutral-400">B-roll prompt</label>
              <textarea
                value={scene.broll_prompt}
                onChange={(e) => setScene(scene.index, { broll_prompt: e.target.value })}
                rows={2}
                className="w-full rounded border border-neutral-700 bg-neutral-800 px-3 py-2 text-xs"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-neutral-400">Video model</label>
              <select
                value={scene.model_path}
                onChange={(e) => setScene(scene.index, { model_path: e.target.value })}
                className="rounded border border-neutral-700 bg-neutral-800 px-2 py-1 text-xs"
              >
                {allModelOptions.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        ))}
        <Section
          label="CTA"
          sectionKey="cta"
          value={script.cta}
          onChange={(v) => setScript((s) => ({ ...s, cta: v }))}
        />
      </div>

      <div className="space-y-3 rounded-lg border border-neutral-800 bg-neutral-900 p-5">
        <label className="block text-sm text-neutral-400">
          Regeneration instructions (unresolved reviewer comments are included automatically)
        </label>
        <textarea
          value={instructions}
          onChange={(e) => setInstructions(e.target.value)}
          rows={2}
          placeholder="e.g. Make the hook more controversial, mention office workers"
          className="w-full rounded border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm"
        />
        <div className="flex flex-wrap gap-2">
          <button
            onClick={save}
            disabled={!!busy}
            className="rounded border border-neutral-700 px-4 py-2 text-sm hover:bg-neutral-800 disabled:opacity-50"
          >
            {busy === 'save' ? 'Saving…' : 'Save as new version'}
          </button>
          <button
            onClick={() => regenerate(false)}
            disabled={!!busy}
            className="rounded border border-neutral-700 px-4 py-2 text-sm hover:bg-neutral-800 disabled:opacity-50"
          >
            {busy === 'regen' ? 'Generating…' : 'Regenerate (revise current)'}
          </button>
          <button
            onClick={() => regenerate(true)}
            disabled={!!busy}
            className="rounded border border-neutral-700 px-4 py-2 text-sm hover:bg-neutral-800 disabled:opacity-50"
          >
            Regenerate from scratch
          </button>
          <button
            onClick={sendForReview}
            disabled={!!busy || !script.hook}
            className="ml-auto rounded bg-yellow-400 px-4 py-2 text-sm font-semibold text-black hover:bg-yellow-300 disabled:opacity-50"
          >
            {busy === 'review' ? 'Sending…' : 'Save + Send for review'}
          </button>
        </div>
        {error && <p className="text-sm text-red-400">{error}</p>}
      </div>

      {versions.length > 1 && (
        <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-5">
          <h2 className="mb-2 text-sm font-semibold text-neutral-300">Version history</h2>
          <ul className="space-y-1 text-xs text-neutral-400">
            {versions.map((v) => (
              <li key={v.id}>
                v{v.version} — {v.created_by} — {new Date(v.created_at).toLocaleString()}
                {v.id === video.current_script_version_id && (
                  <span className="ml-2 text-emerald-400">(current)</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
