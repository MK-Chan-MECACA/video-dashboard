import type { Job, PredictionResult } from '@vd/shared';
import { r2 } from './clients';
import {
  completeJob,
  enqueueJob,
  failJobWithRetry,
  getAssets,
  hasPendingJob,
  insertAsset,
  logEvent,
  setVideoStatus,
  touchJob,
} from './db';

/**
 * Extract a PredictionResult from webhook-written job columns, if the web
 * app's webhook route already stored a terminal payload. Returns null when
 * the worker should poll WaveSpeed itself.
 */
export function resultFromWebhookColumns(job: Job): PredictionResult | null {
  if (job.external_status !== 'completed' && job.external_status !== 'failed') return null;
  const raw = job.external_output as Record<string, unknown> | null;
  const d = ((raw?.data as Record<string, unknown> | undefined) ?? raw) as
    | Record<string, unknown>
    | undefined;
  if (!d) return null;
  const outputs = Array.isArray(d.outputs) ? (d.outputs as string[]) : [];
  if (job.external_status === 'completed' && outputs.length === 0) return null; // incomplete payload — poll instead
  return {
    id: String(d.id ?? job.external_id ?? ''),
    status: job.external_status,
    outputs,
    error: (d.error as string) || null,
  };
}

/**
 * Finalize an avatar/scene job whose external prediction reached a terminal
 * state: download the output into R2, record the asset, mark the job, and
 * advance the video when everything it needs is present. Failed predictions
 * go through failJobWithRetry — the retried job submits a NEW prediction.
 */
export async function finalizeExternalJob(job: Job, result: PredictionResult): Promise<void> {
  if (result.status === 'created' || result.status === 'processing') {
    await touchJob(job.id); // still running — wait another backstop interval
    return;
  }

  if (result.status === 'failed' || result.outputs.length === 0) {
    const reason =
      result.status === 'failed'
        ? `WaveSpeed prediction ${result.id} failed: ${result.error ?? 'unknown error'}`
        : `WaveSpeed prediction ${result.id} completed with no outputs`;
    await failJobWithRetry(job, reason);
    return;
  }

  const outputUrl = result.outputs[0];
  const sceneIndex = job.type === 'scene' ? Number(job.payload.scene_index) : null;
  const key =
    job.type === 'avatar'
      ? `videos/${job.video_id}/avatar.mp4`
      : `videos/${job.video_id}/scene_${sceneIndex}.mp4`;

  const sizeBytes = await r2().putFromUrl(key, outputUrl, 'video/mp4');
  await insertAsset({
    video_id: job.video_id,
    kind: job.type === 'avatar' ? 'avatar_video' : 'scene_clip',
    scene_index: sceneIndex,
    r2_key: key,
    size_bytes: sizeBytes,
    meta: {
      prediction_id: result.id,
      model: (job.payload.model_path as string | undefined) ?? null,
    },
  });
  await completeJob(job.id, { external_status: 'completed', external_output: result });
  await logEvent(job.video_id, `${job.type}_generated`, {
    job_id: job.id,
    prediction_id: result.id,
    r2_key: key,
    ...(sceneIndex != null ? { scene_index: sceneIndex } : {}),
  });
  console.log(`[finalize] ${job.type} ${job.id} -> ${key}`);

  await maybeAdvanceAfterGeneration(job.video_id);
}

/**
 * If the video now has the avatar plus all 3 scene clips, move to rendering
 * and enqueue the render job; if only the avatar is done, nudge
 * avatar_generating -> scenes_generating. All transitions are guarded by
 * canTransition (setVideoStatus skips invalid ones), which also makes the
 * render enqueue race-safe: only the finalizer that wins the transition
 * enqueues.
 */
async function maybeAdvanceAfterGeneration(videoId: string): Promise<void> {
  const assets = await getAssets(videoId);
  const hasAvatar = assets.some((a) => a.kind === 'avatar_video');
  const sceneIndexes = new Set(
    assets.filter((a) => a.kind === 'scene_clip' && a.scene_index != null).map((a) => a.scene_index),
  );

  if (hasAvatar && sceneIndexes.size >= 3) {
    const moved = await setVideoStatus(videoId, 'rendering', { reason: 'all clips ready' });
    if (moved && !(await hasPendingJob(videoId, 'render'))) {
      await enqueueJob(videoId, 'render', {});
    }
  } else if (hasAvatar) {
    // Best-effort: avatar done but scenes still pending.
    await setVideoStatus(videoId, 'scenes_generating', { reason: 'avatar ready, scenes pending' });
  }
}
