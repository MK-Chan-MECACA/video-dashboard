import { DEFAULT_SCENE_MODEL, type Job } from '@vd/shared';
import { wavespeed } from '../clients';
import { setJobAwaitingExternal } from '../db';
import { wavespeedWebhookUrl } from '../env';

export async function handleScene(job: Job): Promise<void> {
  const sceneIndex = Number(job.payload.scene_index);
  const prompt = job.payload.prompt as string | undefined;
  if (!Number.isInteger(sceneIndex) || !prompt) {
    throw new Error(`scene job ${job.id}: payload needs scene_index + prompt`);
  }
  const modelPath = (job.payload.model_path as string | undefined) || DEFAULT_SCENE_MODEL;
  const durationHint = Number(job.payload.duration_hint) || 8;

  // Coerce duration/params to the model's own schema; fall back to defaults
  // if the catalog fetch fails so a WaveSpeed hiccup can't block submits.
  const constraints = await wavespeed()
    .getSceneModelConstraints(modelPath)
    .catch(() => undefined);

  const predictionId = await wavespeed().submitScene({
    modelPath,
    prompt,
    durationS: durationHint,
    constraints,
    webhookUrl: wavespeedWebhookUrl(),
  });

  await setJobAwaitingExternal(job.id, predictionId);
  console.log(`[scene] job ${job.id} (scene ${sceneIndex}) awaiting prediction ${predictionId}`);
}
