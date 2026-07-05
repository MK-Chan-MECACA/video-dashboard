import { STATUS_LABELS } from '@vd/shared/pipeline';
import type { VideoStatus } from '@vd/shared/types';

type Tone = { dot: string; bg: string; border: string; fg: string };

const STYLES: Partial<Record<VideoStatus, Tone>> = {
  draft: { dot: '#8f887b', bg: '#26221b', border: '#3a352d', fg: '#c9c0b0' },
  script_generating: { dot: '#6aa9ff', bg: '#16233a', border: '#22345a', fg: '#9ec5ff' },
  voice_generating: { dot: '#6aa9ff', bg: '#16233a', border: '#22345a', fg: '#9ec5ff' },
  avatar_generating: { dot: '#6aa9ff', bg: '#16233a', border: '#22345a', fg: '#9ec5ff' },
  scenes_generating: { dot: '#6aa9ff', bg: '#16233a', border: '#22345a', fg: '#9ec5ff' },
  script_review: { dot: '#e9b949', bg: '#2a2310', border: '#3a2f16', fg: '#e9b949' },
  video_review: { dot: '#e9b949', bg: '#2a2310', border: '#3a2f16', fg: '#e9b949' },
  script_changes_requested: { dot: '#f0a35a', bg: '#2e2011', border: '#4a3418', fg: '#f0b57a' },
  video_changes_requested: { dot: '#f0a35a', bg: '#2e2011', border: '#4a3418', fg: '#f0b57a' },
  script_approved: { dot: '#63d2a4', bg: '#12241b', border: '#1f3a2b', fg: '#7fe0b4' },
  approved: { dot: '#63d2a4', bg: '#12241b', border: '#1f3a2b', fg: '#7fe0b4' },
  rendering: { dot: '#c79cff', bg: '#221a33', border: '#352a4d', fg: '#c79cff' },
  scheduled: { dot: '#4fd6e0', bg: '#0f2529', border: '#1c3d43', fg: '#7fe6ee' },
  posted: { dot: '#5fce7e', bg: '#12241a', border: '#1f3a2b', fg: '#86e29a' },
  failed: { dot: '#f0846a', bg: '#2a120c', border: '#4a2018', fg: '#f0846a' },
};

const FALLBACK: Tone = { dot: '#8f887b', bg: '#26221b', border: '#3a352d', fg: '#c9c0b0' };

export function StatusBadge({ status }: { status: VideoStatus }) {
  const t = STYLES[status] ?? FALLBACK;
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium"
      style={{ backgroundColor: t.bg, borderColor: t.border, color: t.fg }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: t.dot }} />
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}
