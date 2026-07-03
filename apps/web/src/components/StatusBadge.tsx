import { STATUS_LABELS } from '@vd/shared/pipeline';
import type { VideoStatus } from '@vd/shared/types';

const COLORS: Partial<Record<VideoStatus, string>> = {
  draft: 'bg-neutral-700 text-neutral-200',
  script_generating: 'bg-blue-900 text-blue-200',
  script_review: 'bg-amber-900 text-amber-200',
  script_changes_requested: 'bg-orange-900 text-orange-200',
  script_approved: 'bg-emerald-900 text-emerald-200',
  voice_generating: 'bg-blue-900 text-blue-200',
  avatar_generating: 'bg-blue-900 text-blue-200',
  scenes_generating: 'bg-blue-900 text-blue-200',
  rendering: 'bg-purple-900 text-purple-200',
  video_review: 'bg-amber-900 text-amber-200',
  video_changes_requested: 'bg-orange-900 text-orange-200',
  approved: 'bg-emerald-900 text-emerald-200',
  scheduled: 'bg-cyan-900 text-cyan-200',
  posted: 'bg-green-900 text-green-200',
  failed: 'bg-red-900 text-red-200',
};

export function StatusBadge({ status }: { status: VideoStatus }) {
  return (
    <span
      className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${COLORS[status] ?? 'bg-neutral-700'}`}
    >
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}
