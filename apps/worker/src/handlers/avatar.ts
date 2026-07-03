import type { Job } from '@vd/shared';
import { r2, wavespeed } from '../clients';
import { getBrandAsset, getLatestAsset, setJobAwaitingExternal } from '../db';
import { wavespeedWebhookUrl } from '../env';

const PRESIGN_TTL_S = 6 * 3600;

export async function handleAvatar(job: Job): Promise<void> {
  const brandAssetId = job.payload.brand_asset_id as string | undefined;
  const reference = await getBrandAsset('avatar_reference', brandAssetId);
  if (!reference) throw new Error('No avatar_reference brand asset found');
  if (brandAssetId && reference.kind !== 'avatar_reference') {
    throw new Error(`Brand asset ${brandAssetId} is kind ${reference.kind}, not avatar_reference`);
  }

  const voiceover = await getLatestAsset(job.video_id, 'voiceover');
  if (!voiceover) throw new Error(`No voiceover asset for video ${job.video_id}`);

  const [referenceUrl, audioUrl] = await Promise.all([
    r2().presignGet(reference.r2_key, PRESIGN_TTL_S),
    r2().presignGet(voiceover.r2_key, PRESIGN_TTL_S),
  ]);

  const webhookUrl = wavespeedWebhookUrl();
  const isVideo = /\.(mp4|mov)$/i.test(reference.r2_key);
  const modelPath = isVideo
    ? 'wavespeed-ai/infinitetalk/video-to-video'
    : 'wavespeed-ai/infinitetalk';

  const predictionId = isVideo
    ? await wavespeed().submitAvatarVideoToVideo({
        videoUrl: referenceUrl,
        audioUrl,
        resolution: '720p',
        webhookUrl,
      })
    : await wavespeed().submitAvatarImage({
        imageUrl: referenceUrl,
        audioUrl,
        resolution: '720p',
        webhookUrl,
      });

  await setJobAwaitingExternal(job.id, predictionId, {
    model_path: modelPath,
    brand_asset_id: reference.id,
  });
  console.log(`[avatar] job ${job.id} awaiting prediction ${predictionId} (${modelPath})`);
}
