'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

/** Yellow V-number badge — click to reassign to any unused number. */
export function VideoNumberBadge({ videoId, videoNo }: { videoId: string; videoNo: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function edit() {
    const input = window.prompt(
      `Reassign video number (currently V${videoNo}).\nPick any number not used by another video:`,
      String(videoNo),
    );
    if (!input) return;
    const next = Number(input.replace(/^v/i, ''));
    if (!Number.isInteger(next) || next < 1) {
      window.alert('Enter a positive whole number, e.g. 13');
      return;
    }
    if (next === videoNo) return;
    setBusy(true);
    const res = await fetch(`/api/videos/${videoId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ video_no: next }),
    });
    setBusy(false);
    if (!res.ok) {
      window.alert(await res.text());
      return;
    }
    router.refresh();
  }

  return (
    <button
      onClick={edit}
      disabled={busy}
      title="Click to reassign the video number"
      className="studio-lift rounded-[5px] bg-studio-accent px-2 py-0.5 font-mono text-xs text-studio-on-accent disabled:opacity-50"
    >
      {busy ? '…' : `V${videoNo}`}
    </button>
  );
}

export function DeleteVideoButton({
  videoId,
  videoNo,
  title,
}: {
  videoId: string;
  videoNo: number;
  title: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    const ok = window.confirm(
      `Delete V${videoNo} — "${title}"?\n\nThis permanently removes the video, all its script versions, review links, and comments. The number V${videoNo} will not be reused.`,
    );
    if (!ok) return;
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/videos/${videoId}`, { method: 'DELETE' });
    setBusy(false);
    if (!res.ok) {
      setError(await res.text());
      return;
    }
    router.push('/');
    router.refresh();
  }

  return (
    <div className="flex items-center gap-3">
      <button
        onClick={remove}
        disabled={busy}
        className="rounded-[8px] border border-[#4a2018] px-3.5 py-2 text-[12.5px] text-[#f0846a] hover:bg-[#1c110d] disabled:opacity-50"
      >
        {busy ? 'Deleting…' : `Delete V${videoNo} · ${title}`}
      </button>
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
}
