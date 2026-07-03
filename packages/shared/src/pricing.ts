import type { Asset, Job } from './types';
import { DEFAULT_SCENE_MODEL } from './types';

/**
 * Provider rates used to estimate what one video actually cost to generate.
 * Verified against wavespeed.ai model pages, developers.heygen.com/docs/pricing
 * and Anthropic pricing on 2026-07-04. Scene rates assume each model's default
 * resolution, since submitScene() sends no resolution parameter (720p for most).
 * Update this table when models or prices change — costs are computed on read,
 * so corrections apply retroactively.
 */

/** HeyGen TTS ("Speech — Starfish"), billed per second of audio. */
export const HEYGEN_TTS_PER_S = 0.000667;

/** Claude script + caption calls, flat estimate (Sonnet, ~2.6k in / ~0.9k out). */
export const CLAUDE_LLM_FLAT = 0.02;

/** Per-second billing with a minimum billable duration. */
interface PerSecondRate {
  perSecondUsd: number;
  minBillableS: number;
}

/** Flat per-clip billing, tiered by duration (first tier whose maxS fits). */
interface FlatRate {
  flatTiers: { maxS: number; usd: number }[];
}

type Rate = PerSecondRate | FlatRate;

/** InfiniteTalk avatar — 720p (hardcoded in the avatar handler), min 5s billed. */
export const AVATAR_RATE: PerSecondRate = { perSecondUsd: 0.06, minBillableS: 5 };

/** Text-to-video B-roll rates, keyed by WaveSpeed model path. */
export const SCENE_RATES: Record<string, Rate> = {
  'bytedance/seedance-2.0/text-to-video': { perSecondUsd: 0.24, minBillableS: 4 },
  'bytedance/seedance-2.0/text-to-video-turbo': { perSecondUsd: 0.14, minBillableS: 4 },
  'bytedance/seedance-2.0-mini/text-to-video': { perSecondUsd: 0.12, minBillableS: 4 },
  'alibaba/wan-2.7/text-to-video': { perSecondUsd: 0.1, minBillableS: 5 },
  'kwaivgi/kling-v3-turbo-std/text-to-video': { perSecondUsd: 0.112, minBillableS: 3 },
  // Audio is disabled for scene clips, so Veo bills at the no-audio flat rate.
  'google/veo3.1-fast/text-to-video': { flatTiers: [{ maxS: 8, usd: 0.8 }] },
  'openai/sora-2/text-to-video': { perSecondUsd: 0.1, minBillableS: 4 },
  'minimax/hailuo-2.3/t2v-standard': {
    flatTiers: [
      { maxS: 6, usd: 0.23 },
      { maxS: 10, usd: 0.56 },
    ],
  },
  'vidu/q3/text-to-video': { perSecondUsd: 0.15, minBillableS: 1 },
};

export interface CostLine {
  label: string;
  usd: number;
  /** True when a duration or rate had to be assumed rather than read from data. */
  approx: boolean;
}

export interface VideoCost {
  totalUsd: number;
  approx: boolean;
  lines: CostLine[];
}

function rateCost(rate: Rate, durationS: number): number {
  if ('flatTiers' in rate) {
    const tier =
      rate.flatTiers.find((t) => durationS <= t.maxS) ?? rate.flatTiers[rate.flatTiers.length - 1];
    return tier.usd;
  }
  return Math.max(durationS, rate.minBillableS) * rate.perSecondUsd;
}

/**
 * A WaveSpeed job bills one generation once it has submitted a prediction
 * (external_id set). Failed predictions are auto-refunded by WaveSpeed and
 * pre-submit failures never reach the API, so retries don't multiply cost.
 * Re-generations create separate job rows and are counted per job.
 */
function billedGeneration(job: Job): boolean {
  return job.external_id != null || job.status === 'succeeded';
}

const FALLBACK_VOICEOVER_S = 15;
const FALLBACK_SCENE_S = 5;

/**
 * Estimate what a video has cost so far, from its persisted assets and job
 * history. Pure function; safe for both list and detail views. Videos early
 * in the pipeline return only the cost of what has already run.
 */
export function estimateVideoCost(assets: Asset[], jobs: Job[]): VideoCost {
  const lines: CostLine[] = [];

  const latest = (kind: string, sceneIndex?: number): Asset | undefined =>
    assets
      .filter((a) => a.kind === kind && (sceneIndex === undefined || a.scene_index === sceneIndex))
      .at(-1);

  // Script + caption LLM calls run before/around the jobs; count them as soon
  // as the pipeline has produced anything.
  if (jobs.length > 0 || assets.length > 0) {
    lines.push({ label: 'Script + caption (Claude)', usd: CLAUDE_LLM_FLAT, approx: false });
  }

  const voiceoverAsset = latest('voiceover');
  const voiceoverS = voiceoverAsset?.duration_s ?? null;
  if (voiceoverAsset) {
    lines.push({
      label: 'Voiceover (HeyGen TTS)',
      usd: (voiceoverS ?? FALLBACK_VOICEOVER_S) * HEYGEN_TTS_PER_S,
      approx: voiceoverS == null,
    });
  }

  for (const _job of jobs.filter((j) => j.type === 'avatar' && billedGeneration(j))) {
    const avatarS = latest('avatar_video')?.duration_s;
    const durationS = avatarS ?? voiceoverS ?? FALLBACK_VOICEOVER_S;
    lines.push({
      label: 'Avatar (InfiniteTalk)',
      usd: rateCost(AVATAR_RATE, durationS),
      approx: avatarS == null && voiceoverS == null,
    });
  }

  for (const job of jobs.filter((j) => j.type === 'scene' && billedGeneration(j))) {
    const sceneIndex = Number(job.payload.scene_index) || 0;
    const modelPath = (job.payload.model_path as string | undefined) || DEFAULT_SCENE_MODEL;
    const rate = SCENE_RATES[modelPath];
    const assetS = latest('scene_clip', sceneIndex)?.duration_s;
    const hintS = Number(job.payload.duration_hint) || null;
    const durationS = assetS ?? hintS ?? FALLBACK_SCENE_S;
    lines.push({
      label: `Scene ${sceneIndex} B-roll`,
      usd: rateCost(rate ?? SCENE_RATES[DEFAULT_SCENE_MODEL], durationS),
      approx: rate == null || (assetS == null && hintS == null),
    });
  }

  const totalUsd = lines.reduce((sum, l) => sum + l.usd, 0);
  return { totalUsd, approx: lines.some((l) => l.approx), lines };
}

/** "$4.87", or "~$4.87" when the estimate involved assumed values. */
export function formatUsd(usd: number, approx = false): string {
  return `${approx ? '~' : ''}$${usd.toFixed(2)}`;
}
