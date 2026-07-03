import type { Job } from '@vd/shared';
import { ghl, r2 } from '../clients';
import {
  completeJob,
  db,
  getLatestAsset,
  getVideo,
  insertPost,
  logEvent,
  setVideoStatus,
} from '../db';
import { requiredEnv } from '../env';

/**
 * Default schedule: tomorrow 19:00 Asia/Kuala_Lumpur. KL is a fixed UTC+8
 * (no DST), so 19:00 KL == 11:00 UTC; Intl gives us tomorrow's civil date
 * in KL without extra deps.
 */
export function nextDay19KualaLumpur(now = new Date()): string {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kuala_Lumpur',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const tomorrowInKl = new Date(now.getTime() + 24 * 3600 * 1000);
  const [y, m, d] = fmt.format(tomorrowInKl).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 11, 0, 0)).toISOString();
}

export async function handleGhlPost(job: Job): Promise<void> {
  const video = await getVideo(job.video_id);
  const caption = video.caption;
  if (!caption) throw new Error(`Video ${video.id} has no caption to post with`);

  const finalAsset = await getLatestAsset(video.id, 'final_video');
  if (!finalAsset) throw new Error(`Video ${video.id} has no final_video asset`);
  const mediaUrl = r2().publicUrl(finalAsset.r2_key);

  const scheduleDate = video.schedule_at
    ? new Date(video.schedule_at).toISOString()
    : nextDay19KualaLumpur();

  const accountId = requiredEnv('GHL_TIKTOK_ACCOUNT_ID');
  const ghlPostId = await ghl().schedulePost({
    accountId,
    userId: requiredEnv('GHL_USER_ID'),
    caption,
    mediaUrl,
    scheduleDate,
  });

  await insertPost({
    video_id: video.id,
    ghl_post_id: ghlPostId,
    ghl_account_id: accountId,
    caption,
    schedule_date: scheduleDate,
  });
  await db()`update videos set ghl_post_id = ${ghlPostId} where id = ${video.id}`;
  await logEvent(video.id, 'post_scheduled', {
    job_id: job.id,
    ghl_post_id: ghlPostId,
    schedule_date: scheduleDate,
  });
  await setVideoStatus(video.id, 'scheduled', { job_id: job.id, ghl_post_id: ghlPostId });
  await completeJob(job.id);
}
