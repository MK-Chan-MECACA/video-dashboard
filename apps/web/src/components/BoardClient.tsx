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
  /** Pre-formatted estimated spend (e.g. "$4.87"); null until generation starts. */
  cost: string | null;
}

type SortMode = 'recent' | 'no_asc' | 'no_desc';

/** Presentational accent per pipeline column (keyed by BOARD_COLUMNS title). */
const COLUMN_ACCENT: Record<string, string> = {
  Scripting: '#e9b949',
  'Script Review': '#e9b949',
  Generating: '#6aa9ff',
  Rendering: '#c79cff',
  'Video Review': '#e9b949',
  Scheduled: '#4fd6e0',
  Posted: '#5fce7e',
  Failed: '#f0846a',
};

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

  const attention = [
    {
      count: videos.filter((v) => v.status === 'script_review' || v.status === 'video_review').length,
      label: 'In review — awaiting a decision',
      dot: '#e9b949',
    },
    {
      count: videos.filter((v) =>
        ['script_approved', 'voice_generating', 'avatar_generating', 'scenes_generating', 'rendering'].includes(
          v.status,
        ),
      ).length,
      label: 'Generating & rendering now',
      dot: '#6aa9ff',
    },
    {
      count: videos.filter((v) => v.status === 'failed').length,
      label: 'Failed — needs a retry',
      dot: '#f0846a',
    },
  ];

  return (
    <div>
      <div className="studio-eyebrow mb-1.5">Production pipeline</div>
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-tight text-studio-bright">Pipeline</h1>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter — V4, 12, or title…"
          className="w-52 rounded-[9px] border border-studio-border-strong bg-studio-inset px-3 py-2 text-sm text-studio-text placeholder:text-studio-muted"
        />
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as SortMode)}
          className="rounded-[9px] border border-studio-border-strong bg-studio-inset px-3 py-2 text-sm text-studio-sub"
        >
          <option value="recent">Recently updated</option>
          <option value="no_asc">Number ↑ (V1 first)</option>
          <option value="no_desc">Number ↓ (newest first)</option>
        </select>
        <Link
          href="/videos/new"
          className="studio-lift ml-auto rounded-[9px] bg-studio-accent px-4 py-2 text-sm font-semibold text-studio-on-accent"
        >
          + New Video
        </Link>
      </div>

      {error && (
        <p className="mb-3 rounded-[8px] bg-red-950 p-2 text-sm text-red-300">{error}</p>
      )}

      {videos.length > 0 && (
        <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
          {attention.map((a) => (
            <div
              key={a.label}
              className="flex items-center gap-3 rounded-[12px] border border-studio bg-studio-inset px-4 py-3.5"
            >
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: a.dot }} />
              <div>
                <div className="text-2xl font-semibold leading-none text-studio-bright">{a.count}</div>
                <div className="mt-1.5 text-xs text-studio-sub">{a.label}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-[14px] overflow-x-auto pb-4">
        {BOARD_COLUMNS.map((col, i) => {
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
              className={`w-[242px] shrink-0 rounded-[12px] border p-3 transition-colors ${
                isDropTarget
                  ? 'border-studio-border-hover bg-studio-inset ring-1 ring-studio-accent'
                  : 'border-studio bg-studio-panel'
              }`}
            >
              <div className="mb-2.5 flex items-center gap-2">
                <span className="font-mono text-[11px] text-studio-muted">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <span className="text-sm font-semibold text-studio-sub">{col.title}</span>
                <span className="ml-auto rounded-full bg-studio-inset px-2 text-[11px] text-studio-muted">
                  {items.length}
                </span>
              </div>
              <div
                className="mb-3 h-[3px] rounded-full"
                style={{ backgroundColor: COLUMN_ACCENT[col.title] ?? '#2a2723' }}
              />
              <div className="space-y-2.5">
                {items.map((v) => {
                  const failed = v.status === 'failed';
                  return (
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
                      className={`studio-card block cursor-grab rounded-[12px] border p-3 active:cursor-grabbing ${
                        failed ? 'border-[#4a2018] bg-[#1c110d]' : 'border-studio bg-studio-card'
                      } ${dragId === v.id ? 'opacity-40' : ''}`}
                    >
                      <p className="mb-2 line-clamp-2 text-sm font-medium text-studio-text">
                        {v.video_no && (
                          <span className="mr-1.5 font-mono text-xs text-studio-accent">
                            V{v.video_no}
                          </span>
                        )}
                        {v.title}
                      </p>
                      <span className="flex flex-wrap items-center gap-1.5">
                        <StatusBadge status={v.status} />
                        {v.cost && (
                          <span className="rounded-[5px] bg-studio-inset px-1.5 py-0.5 font-mono text-[10px] text-studio-muted">
                            {v.cost}
                          </span>
                        )}
                      </span>
                      {v.status === 'failed' && v.status_error && (
                        <p className="mt-2 line-clamp-2 text-xs text-red-400">{v.status_error}</p>
                      )}
                    </Link>
                  );
                })}
                {items.length === 0 && <p className="text-xs text-studio-faint">—</p>}
              </div>
            </div>
          );
        })}
      </div>
      <p className="mt-3.5 text-xs text-studio-faint">
        Drag a card into another column to move it to that stage.
      </p>
    </div>
  );
}
