import type { VideoStatus } from './types';

/**
 * Single source of truth for the pipeline state machine.
 * The worker tick is the only writer of generation states;
 * review routes write the review decisions.
 */
export const TRANSITIONS: Record<VideoStatus, VideoStatus[]> = {
  draft: ['script_generating', 'script_review'],
  script_generating: ['script_review', 'failed'],
  // voice_generating from the script states covers the one-click "save +
  // regenerate video" on a video that already has a voiceover.
  script_review: ['script_approved', 'script_changes_requested', 'voice_generating'],
  script_changes_requested: ['script_generating', 'script_review', 'voice_generating'],
  script_approved: ['voice_generating'],
  voice_generating: ['avatar_generating', 'failed'],
  avatar_generating: ['scenes_generating', 'rendering', 'failed'],
  scenes_generating: ['rendering', 'failed'],
  rendering: ['video_review', 'failed'],
  // Operator regeneration (voice/avatar/scene/re-render) is allowed from
  // video_review and approved, so a finished video can loop back through
  // generation after a script edit. scheduled/posted stay closed — the GHL
  // post already references the rendered file.
  video_review: [
    'approved',
    'video_changes_requested',
    'voice_generating',
    'avatar_generating',
    'scenes_generating',
    'rendering',
  ],
  video_changes_requested: ['voice_generating', 'avatar_generating', 'scenes_generating', 'rendering'],
  approved: ['scheduled', 'failed', 'voice_generating', 'avatar_generating', 'scenes_generating', 'rendering'],
  scheduled: ['posted', 'failed'],
  posted: [],
  failed: [
    'script_generating',
    'script_review',
    'voice_generating',
    'avatar_generating',
    'scenes_generating',
    'rendering',
    'approved',
    // Recreating a GHL post after a failed publish re-schedules the video.
    'scheduled',
  ],
};

export function canTransition(from: VideoStatus, to: VideoStatus): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

/** Kanban board grouping. */
export const BOARD_COLUMNS: { title: string; statuses: VideoStatus[] }[] = [
  { title: 'Scripting', statuses: ['draft', 'script_generating', 'script_changes_requested'] },
  { title: 'Script Review', statuses: ['script_review'] },
  {
    title: 'Generating',
    statuses: ['script_approved', 'voice_generating', 'avatar_generating', 'scenes_generating'],
  },
  { title: 'Rendering', statuses: ['rendering', 'video_changes_requested'] },
  { title: 'Video Review', statuses: ['video_review'] },
  { title: 'Scheduled', statuses: ['approved', 'scheduled'] },
  { title: 'Posted', statuses: ['posted'] },
  { title: 'Failed', statuses: ['failed'] },
];

export const STATUS_LABELS: Record<VideoStatus, string> = {
  draft: 'Draft',
  script_generating: 'Generating script',
  script_review: 'Script in review',
  script_changes_requested: 'Script changes requested',
  script_approved: 'Script approved',
  voice_generating: 'Generating voiceover',
  avatar_generating: 'Generating avatar',
  scenes_generating: 'Generating scenes',
  rendering: 'Rendering',
  video_review: 'Video in review',
  video_changes_requested: 'Video changes requested',
  approved: 'Approved',
  scheduled: 'Scheduled',
  posted: 'Posted',
  failed: 'Failed',
};
