import { generateCaption, type Job, type Script } from '@vd/shared';
import {
  completeJob,
  db,
  enqueueJob,
  getAppSetting,
  getScriptVersion,
  getVideo,
  logEvent,
} from '../db';
import { requiredEnv } from '../env';

export async function handleCaption(job: Job): Promise<void> {
  const video = await getVideo(job.video_id);

  // Operator edits win: only generate when the caption is still empty.
  if (video.caption == null) {
    if (!video.current_script_version_id) {
      throw new Error(`Video ${video.id} has no current script version`);
    }
    const sv = await getScriptVersion(video.current_script_version_id);
    const script: Script = { hook: sv.hook, scenes: sv.scenes, cta: sv.cta };
    const captionPrompt = await getAppSetting('caption_system_prompt');
    const caption = await generateCaption({
      apiKey: requiredEnv('ANTHROPIC_API_KEY'),
      script,
      title: video.title,
      systemPrompt: typeof captionPrompt === 'string' ? captionPrompt : undefined,
    });
    // Guard again in SQL in case the operator saved one meanwhile.
    await db()`
      update videos set caption = ${caption}
      where id = ${video.id} and caption is null
    `;
    await logEvent(video.id, 'caption_generated', { job_id: job.id, length: caption.length });
  }

  await enqueueJob(video.id, 'ghl_post', {});
  await completeJob(job.id);
}
