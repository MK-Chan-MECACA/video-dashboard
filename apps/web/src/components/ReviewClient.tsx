'use client';

import { useEffect, useState } from 'react';

interface ReviewScript {
  hook: string;
  cta: string;
  scenes: { index: number; voiceover: string; broll_prompt: string }[];
  version: number;
}

/** Unique scene code everyone can reference, e.g. "V4-S2". */
function code(videoNo: number | null | undefined, index: number): string {
  return videoNo ? `V${videoNo}-S${index}` : `Scene ${index}`;
}

/** Narrator-bubble scripts: whole VO in `hook`, scenes carry only B-roll prompts. */
function scriptSections(script: ReviewScript, videoNo: number | null | undefined) {
  const narrator = script.scenes.length > 0 && script.scenes.every((s) => !s.voiceover.trim());
  if (narrator) {
    const passage = [script.hook, script.cta].map((t) => t.trim()).filter(Boolean).join(' ');
    return [
      { key: 'hook', label: 'Voiceover', text: passage, sub: '' },
      ...script.scenes.map((s) => ({
        key: `scene_${s.index}`,
        label: `${code(videoNo, s.index)} — B-roll`,
        text: s.broll_prompt,
        sub: '',
      })),
    ];
  }
  return [
    { key: 'hook', label: 'Hook', text: script.hook, sub: '' },
    ...script.scenes.map((s) => ({
      key: `scene_${s.index}`,
      label: code(videoNo, s.index),
      text: s.voiceover,
      sub: s.broll_prompt,
    })),
    { key: 'cta', label: 'Call to action', text: script.cta, sub: '' },
  ];
}

export function ReviewClient({
  token,
  brandName,
  kind,
  videoTitle,
  videoNo,
  awaiting,
  lastDecision,
  script,
  mediaUrl,
}: {
  token: string;
  brandName?: string | null;
  kind: 'script' | 'video';
  videoTitle: string;
  videoNo?: number | null;
  awaiting: boolean;
  lastDecision: { decision: string; reviewer_name: string; created_at: string } | null;
  script: ReviewScript | null;
  mediaUrl: string | null;
}) {
  const [name, setName] = useState('');
  const [comment, setComment] = useState<Record<string, string>>({});
  const [changeNote, setChangeNote] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [sentComments, setSentComments] = useState<string[]>([]);

  useEffect(() => {
    setName(localStorage.getItem('vd_reviewer_name') ?? '');
  }, []);

  function remember(n: string) {
    setName(n);
    localStorage.setItem('vd_reviewer_name', n);
  }

  async function sendComment(sectionKey: string) {
    const body = comment[sectionKey]?.trim();
    if (!body) return;
    setBusy(`c-${sectionKey}`);
    setError(null);
    const res = await fetch(`/api/review/${token}/comment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ section_key: sectionKey, body, author_name: name }),
    });
    setBusy(null);
    if (!res.ok) return setError(await res.text());
    setSentComments((s) => [...s, `${sectionKey}: ${body}`]);
    setComment((c) => ({ ...c, [sectionKey]: '' }));
  }

  async function decide(decision: 'approved' | 'changes_requested') {
    setBusy(decision);
    setError(null);
    const res = await fetch(`/api/review/${token}/decision`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ decision, comment: changeNote, reviewer_name: name }),
    });
    setBusy(null);
    if (!res.ok) return setError(await res.text());
    setDone(decision);
  }

  const CommentBox = ({ sectionKey }: { sectionKey: string }) =>
    awaiting && !done ? (
      <div className="mt-2 flex gap-2">
        <input
          value={comment[sectionKey] ?? ''}
          onChange={(e) => setComment((c) => ({ ...c, [sectionKey]: e.target.value }))}
          placeholder="Add a comment…"
          className="flex-1 rounded border border-neutral-700 bg-neutral-800 px-2 py-1 text-xs"
        />
        <button
          onClick={() => sendComment(sectionKey)}
          disabled={busy === `c-${sectionKey}` || !comment[sectionKey]?.trim()}
          className="rounded border border-neutral-700 px-2 py-1 text-xs hover:bg-neutral-800 disabled:opacity-40"
        >
          Send
        </button>
      </div>
    ) : null;

  return (
    <div className="mx-auto max-w-xl space-y-5 pb-32">
      <div>
        <p className="text-xs uppercase tracking-wide text-yellow-400">
          {brandName ? `${brandName} — ` : ''}
          {kind === 'script' ? 'Script' : 'Video'} review
        </p>
        <h1 className="text-xl font-semibold">
          {videoNo ? <span className="mr-2 font-mono text-yellow-400">V{videoNo}</span> : null}
          {videoTitle}
        </h1>
        {script && kind === 'script' && (
          <p className="text-xs text-neutral-500">Script version {script.version}</p>
        )}
      </div>

      {!awaiting && !done && (
        <div className="rounded border border-neutral-700 bg-neutral-900 p-3 text-sm text-neutral-300">
          {lastDecision
            ? `This ${kind} was already ${lastDecision.decision.replace('_', ' ')} by ${lastDecision.reviewer_name} on ${new Date(lastDecision.created_at).toLocaleString()}.`
            : `This ${kind} is not currently awaiting review.`}
        </div>
      )}

      {kind === 'script' && script && (
        <div className="space-y-3">
          {scriptSections(script, videoNo).map((section) => (
            <div key={section.key} className="rounded-lg border border-neutral-800 bg-neutral-900 p-4">
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-yellow-400">
                {section.label}
              </p>
              <p className="text-sm leading-relaxed">{section.text}</p>
              {section.sub && (
                <p className="mt-1 text-xs text-neutral-500">B-roll: {section.sub}</p>
              )}
              <CommentBox sectionKey={section.key} />
            </div>
          ))}
        </div>
      )}

      {kind === 'video' &&
        (mediaUrl ? (
          <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-4">
            <video controls playsInline src={mediaUrl} className="mx-auto max-h-[70vh] rounded" />
            <CommentBox sectionKey="video" />
          </div>
        ) : (
          <p className="text-sm text-neutral-400">The final video is not ready yet.</p>
        ))}

      {sentComments.length > 0 && (
        <div className="rounded border border-neutral-800 bg-neutral-900 p-3 text-xs text-neutral-400">
          <p className="mb-1 font-semibold text-neutral-300">Your comments:</p>
          {sentComments.map((c, i) => (
            <p key={i}>✓ {c}</p>
          ))}
        </div>
      )}

      {done && (
        <div
          className={`rounded-lg p-4 text-center text-sm font-semibold ${
            done === 'approved' ? 'bg-emerald-900 text-emerald-100' : 'bg-orange-900 text-orange-100'
          }`}
        >
          {done === 'approved'
            ? '✓ Approved — thank you! Production continues automatically.'
            : '✓ Changes requested — the team has been notified.'}
        </div>
      )}

      {awaiting && !done && (
        <div className="fixed inset-x-0 bottom-0 border-t border-neutral-800 bg-neutral-900/95 p-4 backdrop-blur">
          <div className="mx-auto max-w-xl space-y-2">
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                value={name}
                onChange={(e) => remember(e.target.value)}
                placeholder="Your name"
                className="rounded border border-neutral-700 bg-neutral-800 px-2 py-2 text-sm sm:w-40"
              />
              <input
                value={changeNote}
                onChange={(e) => setChangeNote(e.target.value)}
                placeholder="Overall note (required when requesting changes)"
                className="flex-1 rounded border border-neutral-700 bg-neutral-800 px-2 py-2 text-sm"
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => decide('approved')}
                disabled={!!busy}
                className="flex-1 rounded bg-emerald-600 px-4 py-2.5 text-sm font-semibold hover:bg-emerald-500 disabled:opacity-50"
              >
                {busy === 'approved' ? 'Sending…' : '✓ Approve'}
              </button>
              <button
                onClick={() => decide('changes_requested')}
                disabled={!!busy || !changeNote.trim()}
                className="flex-1 rounded bg-orange-700 px-4 py-2.5 text-sm font-semibold hover:bg-orange-600 disabled:opacity-50"
              >
                {busy === 'changes_requested' ? 'Sending…' : 'Request changes'}
              </button>
            </div>
            {error && <p className="text-xs text-red-400">{error}</p>}
          </div>
        </div>
      )}
    </div>
  );
}
