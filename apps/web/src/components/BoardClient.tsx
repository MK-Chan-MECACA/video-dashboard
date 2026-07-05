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

  const inReviewCount = videos.filter(
    (v) => v.status === 'script_review' || v.status === 'video_review',
  ).length;
  // Sum the pre-formatted cost strings ("$4.53" / "~$4.53") for the spend card.
  const spendUsd = videos.reduce((sum, v) => {
    const m = v.cost ? /([0-9]+(?:\.[0-9]+)?)/.exec(v.cost) : null;
    return sum + (m ? parseFloat(m[1]) : 0);
  }, 0);
  const attention = [
    {
      value: String(inReviewCount),
      label: 'In review — awaiting a decision',
      dot: '#e9b949',
      highlight: true,
    },
    {
      value: String(
        videos.filter((v) =>
          ['script_approved', 'voice_generating', 'avatar_generating', 'scenes_generating', 'rendering'].includes(
            v.status,
          ),
        ).length,
      ),
      label: 'Generating & rendering now',
      dot: '#6aa9ff',
      highlight: false,
    },
    {
      value: String(videos.filter((v) => v.status === 'failed').length),
      label: 'Failed — needs a retry',
      dot: '#f0846a',
      highlight: false,
    },
    {
      value: `~$${Math.round(spendUsd)}`,
      label: 'Est. generation spend',
      dot: '#63d2a4',
      highlight: false,
    },
  ];

  return (
    <div>
      <div className="mb-1.5 flex flex-wrap items-end justify-between gap-5">
        <div>
          <div className="studio-eyebrow mb-1.5">Production pipeline</div>
          <h1 className="text-3xl font-semibold tracking-tight text-studio-bright">
            {videos.length} video{videos.length === 1 ? '' : 's'} in flight
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter — V4, 12, or title…"
            className="w-[230px] rounded-[9px] border border-studio-border-strong bg-studio-inset px-3 py-2 text-[13px] text-studio-text placeholder:text-studio-muted"
          />
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortMode)}
            className="rounded-[9px] border border-studio-border-strong bg-studio-inset px-3 py-2 text-[13px] text-studio-sub"
          >
            <option value="recent">Recently updated</option>
            <option value="no_asc">Number ↑ (V1 first)</option>
            <option value="no_desc">Number ↓ (newest first)</option>
          </select>
          <Link
            href="/videos/new"
            className="studio-lift rounded-[9px] bg-studio-accent px-4 py-2 text-[13px] font-semibold text-studio-on-accent"
          >
            + New Video
          </Link>
        </div>
      </div>

      {error && (
        <p className="mb-3 rounded-[8px] bg-red-950 p-2 text-sm text-red-300">{error}</p>
      )}

      {videos.length > 0 && (
        <div className="my-6 flex flex-col gap-3 sm:flex-row">
          {attention.map((a) => (
            <div
              key={a.label}
              className={`flex flex-1 items-center gap-3 rounded-[12px] border px-[17px] py-[15px] ${
                a.highlight
                  ? 'border-[#3a2f16] bg-[linear-gradient(180deg,#1e1a10,#161410)]'
                  : 'border-studio bg-studio-inset'
              }`}
            >
              <span
                className="h-2 w-2 shrink-0 rounded-full"
                style={{
                  backgroundColor: a.dot,
                  boxShadow: a.highlight ? '0 0 0 4px rgba(233,185,73,.15)' : undefined,
                }}
              />
              <div>
                <div className="text-[23px] font-semibold leading-none text-studio-bright">{a.value}</div>
                <div className="mt-1 text-xs text-studio-sub">{a.label}</div>
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
              className={`w-[242px] shrink-0 rounded-[12px] transition-colors ${
                isDropTarget ? 'bg-studio-inset ring-1 ring-studio-accent' : ''
              }`}
            >
              <div className="mb-2.5 flex items-center gap-2">
                <span className="font-mono text-[11px] text-studio-muted">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <span className="text-[13px] font-semibold text-[#d8cfbf]">{col.title}</span>
                <span className="ml-auto rounded-full bg-[#201d18] px-2 py-px text-[11px] text-studio-sub">
                  {items.length}
                </span>
              </div>
              <div
                className="mb-3 h-[3px] rounded-[2px]"
                style={{ backgroundColor: COLUMN_ACCENT[col.title] ?? '#2a2723' }}
              />
              <div className="space-y-2.5 pb-2">
                {items.map((v) => {
                  const failed = v.status === 'failed';
                  const attn = v.status === 'script_review' || v.status === 'video_review';
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
                        failed
                          ? 'border-[#4a2018] bg-[#1c110d]'
                          : attn
                            ? 'border-[#3a2f16] bg-[#17140d]'
                            : 'border-studio-border-strong bg-studio-card'
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
                          <span className="rounded-[5px] bg-[#201d18] px-1.5 py-0.5 font-mono text-[10px] text-studio-muted">
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
