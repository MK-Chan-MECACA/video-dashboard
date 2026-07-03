'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { BOARD_COLUMNS } from '@vd/shared/pipeline';
import type { VideoStatus } from '@vd/shared/types';
import { StatusBadge } from '@/components/StatusBadge';

export interface BoardVideo {
  id: string;
  video_no: number;
  title: string;
  status: VideoStatus;
  status_error: string | null;
}

type SortMode = 'recent' | 'no_asc' | 'no_desc';

export function BoardClient({ videos: initial }: { videos: BoardVideo[] }) {
  const router = useRouter();
  const [videos, setVideos] = useState(initial);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortMode>('recent');
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropCol, setDropCol] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setVideos(initial), [initial]);

  const q = query.trim().toLowerCase();
  const numQuery = /^v?(\d+)$/.exec(q)?.[1];
  const visible = videos.filter((v) => {
    if (!q) return true;
    if (numQuery) return v.video_no === Number(numQuery);
    return v.title.toLowerCase().includes(q) || `v${v.video_no}`.includes(q);
  });

  const sorted =
    sort === 'recent'
      ? visible // server order: updated_at desc
      : [...visible].sort((a, b) =>
          sort === 'no_asc' ? a.video_no - b.video_no : b.video_no - a.video_no,
        );

  const byStatus = new Map<VideoStatus, BoardVideo[]>();
  for (const v of sorted) {
    const list = byStatus.get(v.status) ?? [];
    list.push(v);
    byStatus.set(v.status, list);
  }

  async function moveTo(videoId: string, status: VideoStatus) {
    const prev = videos;
    setVideos((vs) => vs.map((v) => (v.id === videoId ? { ...v, status } : v)));
    setError(null);
    const res = await fetch(`/api/videos/${videoId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    if (!res.ok) {
      setVideos(prev);
      setError(await res.text());
      return;
    }
    router.refresh();
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold">Pipeline</h1>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter — V4, 12, or title…"
          className="w-48 rounded border border-neutral-700 bg-neutral-900 px-2 py-1.5 text-sm"
        />
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as SortMode)}
          className="rounded border border-neutral-700 bg-neutral-900 px-2 py-1.5 text-sm"
        >
          <option value="recent">Recently updated</option>
          <option value="no_asc">Number ↑ (V1 first)</option>
          <option value="no_desc">Number ↓ (newest first)</option>
        </select>
        <Link
          href="/videos/new"
          className="ml-auto rounded bg-yellow-400 px-3 py-1.5 text-sm font-semibold text-black hover:bg-yellow-300"
        >
          + New Video
        </Link>
      </div>

      {error && (
        <p className="mb-3 rounded bg-red-950 p-2 text-sm text-red-300">{error}</p>
      )}

      <div className="flex gap-3 overflow-x-auto pb-4">
        {BOARD_COLUMNS.map((col) => {
          const items = col.statuses.flatMap((s) => byStatus.get(s) ?? []);
          const isDropTarget = dropCol === col.title && dragId;
          return (
            <div
              key={col.title}
              onDragOver={(e) => {
                e.preventDefault();
                setDropCol(col.title);
              }}
              onDragLeave={() => setDropCol((c) => (c === col.title ? null : c))}
              onDrop={(e) => {
                e.preventDefault();
                setDropCol(null);
                const id = e.dataTransfer.getData('text/plain');
                if (id) moveTo(id, col.statuses[0]);
                setDragId(null);
              }}
              className={`w-64 shrink-0 rounded-lg p-3 transition-colors ${
                isDropTarget ? 'bg-neutral-800 ring-1 ring-yellow-400' : 'bg-neutral-900'
              }`}
            >
              <h2 className="mb-2 flex items-center justify-between text-sm font-semibold text-neutral-300">
                {col.title}
                <span className="rounded bg-neutral-800 px-1.5 text-xs">{items.length}</span>
              </h2>
              <div className="space-y-2">
                {items.map((v) => (
                  <Link
                    key={v.id}
                    href={`/videos/${v.id}`}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData('text/plain', v.id);
                      e.dataTransfer.effectAllowed = 'move';
                      setDragId(v.id);
                    }}
                    onDragEnd={() => {
                      setDragId(null);
                      setDropCol(null);
                    }}
                    className={`block cursor-grab rounded border border-neutral-800 bg-neutral-950 p-3 hover:border-neutral-600 active:cursor-grabbing ${
                      dragId === v.id ? 'opacity-40' : ''
                    }`}
                  >
                    <p className="mb-1 line-clamp-2 text-sm font-medium">
                      {v.video_no && (
                        <span className="mr-1.5 font-mono text-xs text-yellow-400">
                          V{v.video_no}
                        </span>
                      )}
                      {v.title}
                    </p>
                    <StatusBadge status={v.status} />
                    {v.status === 'failed' && v.status_error && (
                      <p className="mt-1 line-clamp-2 text-xs text-red-400">{v.status_error}</p>
                    )}
                  </Link>
                ))}
                {items.length === 0 && <p className="text-xs text-neutral-600">—</p>}
              </div>
            </div>
          );
        })}
      </div>
      <p className="text-xs text-neutral-600">
        Drag a card into another column to move it to that stage.
      </p>
    </div>
  );
}
