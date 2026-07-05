'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

export default function NewVideoManualForm() {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [brief, setBrief] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(generate: boolean) {
    setBusy(true);
    setError(null);
    const res = await fetch('/api/videos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, topic_brief: brief, generate }),
    });
    setBusy(false);
    if (!res.ok) {
      setError(await res.text());
      return;
    }
    const { id } = await res.json();
    router.push(`/videos/${id}/script`);
  }

  return (
    <div className="space-y-4 rounded-[16px] border border-studio bg-studio-panel p-6">
      <div>
        <label className="mb-1 block text-sm text-studio-sub">Working title</label>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. The X-Ray Differentiator"
          className="w-full rounded-[8px] border border-studio-border-strong bg-studio-inset px-3 py-2 text-sm"
        />
      </div>
      <div>
        <label className="mb-1 block text-sm text-studio-sub">
          Topic brief — what should this video be about?
        </label>
        <textarea
          value={brief}
          onChange={(e) => setBrief(e.target.value)}
          rows={6}
          placeholder="e.g. Myth-bust a habit your audience thinks is harmless, then position your service as the proper fix."
          className="w-full rounded-[8px] border border-studio-border-strong bg-studio-inset px-3 py-2 text-sm"
        />
      </div>
      {error && <p className="text-sm text-red-400">{error}</p>}
      <div className="flex gap-3">
        <button
          disabled={busy || !title || !brief}
          onClick={() => submit(true)}
          className="studio-lift rounded-[9px] bg-studio-accent px-4 py-2 text-sm font-semibold text-studio-on-accent disabled:opacity-50"
        >
          {busy ? 'Working…' : 'Create + Generate Script'}
        </button>
        <button
          disabled={busy || !title}
          onClick={() => submit(false)}
          className="rounded-[9px] border border-studio-border-strong px-4 py-2 text-sm text-studio-sub hover:bg-studio-inset disabled:opacity-50"
        >
          Create empty
        </button>
      </div>
    </div>
  );
}
