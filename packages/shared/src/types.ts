export type VideoStatus =
  | 'draft'
  | 'script_generating'
  | 'script_review'
  | 'script_changes_requested'
  | 'script_approved'
  | 'voice_generating'
  | 'avatar_generating'
  | 'scenes_generating'
  | 'rendering'
  | 'video_review'
  | 'video_changes_requested'
  | 'approved'
  | 'scheduled'
  | 'posted'
  | 'failed';

export type JobType =
  | 'generate_script'
  | 'tts'
  | 'avatar'
  | 'scene'
  | 'render'
  | 'generate_caption'
  | 'ghl_post';

export type JobStatus =
  | 'queued'
  | 'running'
  | 'awaiting_external'
  | 'succeeded'
  | 'failed';

export type AssetKind =
  | 'voiceover'
  | 'avatar_video'
  | 'scene_clip'
  | 'subtitle_ass'
  | 'final_video'
  | 'thumbnail';

export type BrandAssetKind = 'logo' | 'outro' | 'bgm' | 'avatar_reference';

export type SectionKey = 'hook' | 'scene_1' | 'scene_2' | 'scene_3' | 'cta';

export interface ScriptScene {
  index: number; // 1..3
  voiceover: string;
  broll_prompt: string;
  model_path: string; // wavespeed model path, e.g. bytedance/seedance-v1-pro-t2v-720p
}

export interface Script {
  hook: string;
  scenes: ScriptScene[];
  cta: string;
}

export interface WordTimestamp {
  word: string;
  start: number; // seconds
  end: number; // seconds
}

/** Time window (seconds) each script section occupies in the voiceover. */
export interface SectionWindow {
  section: SectionKey;
  start: number;
  end: number;
}

export interface Video {
  id: string;
  /** Human-friendly unique number — scenes are referenced as V{video_no}-S{index}. */
  video_no: number;
  title: string;
  topic_brief: string | null;
  status: VideoStatus;
  status_error: string | null;
  current_script_version_id: string | null;
  caption: string | null;
  schedule_at: string | null;
  ghl_post_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface ScriptVersion {
  id: string;
  video_id: string;
  version: number;
  hook: string;
  cta: string;
  scenes: ScriptScene[];
  full_voiceover_text: string;
  created_by: 'claude' | 'operator';
  claude_model: string | null;
  created_at: string;
}

export interface Asset {
  id: string;
  video_id: string;
  kind: AssetKind;
  scene_index: number | null;
  r2_key: string;
  duration_s: number | null;
  size_bytes: number | null;
  meta: Record<string, unknown>;
  created_at: string;
}

export interface Job {
  id: string;
  video_id: string;
  type: JobType;
  payload: Record<string, unknown>;
  status: JobStatus;
  external_id: string | null;
  external_status: string | null;
  external_output: unknown;
  attempts: number;
  max_attempts: number;
  run_after: string;
  error: string | null;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
  updated_at: string;
}

export const DEFAULT_SCENE_MODEL = 'bytedance/seedance-2.0/text-to-video';

/**
 * Static fallback only — the script editor loads the live text-to-video
 * catalog from WaveSpeed (GET /api/v3/models) and falls back to this list
 * if that request fails. Model ids verified against the catalog 2026-07-02.
 */
export const SCENE_MODEL_OPTIONS: { value: string; label: string }[] = [
  { value: 'bytedance/seedance-2.0/text-to-video', label: 'Seedance 2.0 (default)' },
  { value: 'bytedance/seedance-2.0/text-to-video-turbo', label: 'Seedance 2.0 Turbo' },
  { value: 'bytedance/seedance-2.0-mini/text-to-video', label: 'Seedance 2.0 Mini' },
  { value: 'alibaba/wan-2.7/text-to-video', label: 'WAN 2.7' },
  { value: 'kwaivgi/kling-v3-turbo-std/text-to-video', label: 'Kling V3 Turbo Std' },
  { value: 'google/veo3.1-fast/text-to-video', label: 'Veo 3.1 Fast' },
  { value: 'openai/sora-2/text-to-video', label: 'Sora 2' },
  { value: 'minimax/hailuo-2.3/t2v-standard', label: 'Hailuo 2.3 Standard' },
  { value: 'vidu/q3/text-to-video', label: 'Vidu Q3' },
];

/** Unique scene code everyone can reference, e.g. "V4-S2" (video 4, scene 2). */
export function sceneCode(videoNo: number | null | undefined, sceneIndex: number): string {
  return videoNo ? `V${videoNo}-S${sceneIndex}` : `Scene ${sceneIndex}`;
}

/**
 * Strip em/en dashes (and `--`) from spoken text — HeyGen reads through them
 * without a pause, rushing the line. Replaced with a comma so the voice
 * actually breathes. Applied to every section BOTH when composing the TTS
 * text and when counting words for section windows, so the word counts used
 * to slice HeyGen's timestamps always match the text HeyGen received.
 * Single hyphens (well-known) are left alone.
 */
export function sanitizeSpokenText(text: string): string {
  return text
    .replace(/\s*(?:—|–|--+)\s*/g, ', ')
    .replace(/,\s*([,.!?;:])/g, '$1')
    .replace(/\s{2,}/g, ' ')
    .replace(/^[,\s]+/, '')
    .trim()
    .replace(/,$/, '.');
}

/** Compose the exact text sent to HeyGen TTS, in timeline order. */
export function fullVoiceoverText(script: Script): string {
  return [script.hook, ...script.scenes.map((s) => s.voiceover), script.cta]
    .map((s) => sanitizeSpokenText(s))
    .filter(Boolean)
    .join(' ');
}

/**
 * Compute each section's time window in the voiceover by walking
 * word timestamps against the known section texts.
 */
export function computeSectionWindows(
  script: Script,
  words: WordTimestamp[],
): SectionWindow[] {
  const sections: { key: SectionKey; text: string }[] = [
    { key: 'hook', text: script.hook },
    ...script.scenes.map((s) => ({
      key: `scene_${s.index}` as SectionKey,
      text: s.voiceover,
    })),
    { key: 'cta', text: script.cta },
  ];

  const countWords = (t: string) =>
    sanitizeSpokenText(t)
      .split(/\s+/)
      .filter(Boolean).length;

  const windows: SectionWindow[] = [];
  let cursor = 0;
  for (const section of sections) {
    const n = countWords(section.text);
    if (n === 0) continue;
    const slice = words.slice(cursor, cursor + n);
    if (slice.length === 0) break;
    windows.push({
      section: section.key,
      start: slice[0].start,
      end: slice[slice.length - 1].end,
    });
    cursor += n;
  }
  return windows;
}

/**
 * Contiguous B-roll coverage windows: the three scenes tile the entire main
 * video [0, totalDurationS] with no gaps, so the full-screen avatar is never
 * exposed. Scene 1 stretches back over the hook, scene 3 forward through the
 * CTA; the interior boundaries sit where scene 2 and scene 3's narration
 * begins. Falls back to equal thirds if the word/section match fails.
 */
export function computeSceneCoverageWindows(
  script: Script,
  words: WordTimestamp[],
  totalDurationS: number,
): SectionWindow[] {
  const total = Math.max(0, totalDurationS);
  const sections = computeSectionWindows(script, words);
  const start2 = sections.find((w) => w.section === 'scene_2')?.start;
  const start3 = sections.find((w) => w.section === 'scene_3')?.start;
  let bounds: [number, number, number, number];
  if (start2 === undefined || start3 === undefined) {
    bounds = [0, total / 3, (2 * total) / 3, total];
  } else {
    const b2 = Math.min(Math.max(start2, 0), total);
    const b3 = Math.min(Math.max(start3, b2), total);
    bounds = [0, b2, b3, total];
  }
  return [1, 2, 3].map((i) => ({
    section: `scene_${i}` as SectionKey,
    start: bounds[i - 1],
    end: bounds[i],
  }));
}
