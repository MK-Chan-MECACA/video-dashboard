import {
  DEFAULT_SCENE_MODEL,
  computeSceneCoverageWindows,
  type Job,
  type Script,
  type WordTimestamp,
} from '@vd/shared';
import { wavespeed } from '../clients';
import { getLatestAsset, getScriptVersion, getVideo, setJobAwaitingExternal } from '../db';
import { wavespeedWebhookUrl } from '../env';

export async function handleScene(job: Job): Promise<void> {
  const sceneIndex = Number(job.payload.scene_index);
  if (!Number.isInteger(sceneIndex)) {
    throw new Error(`scene job ${job.id}: payload needs scene_index`);
  }
  let prompt = job.payload.prompt as string | undefined;
  let modelPath = job.payload.model_path as string | undefined;
  let durationHint = Number(job.payload.duration_hint) || 0;

  // Regenerate jobs carry only scene_index; hydrate the rest from the current
  // script version, the same way tts.ts builds the original scene payloads.
  if (!prompt) {
    const video = await getVideo(job.video_id);
    if (!video.current_script_version_id) {
      throw new Error(`scene job ${job.id}: video has no current script version`);
    }
    const sv = await getScriptVersion(video.current_script_version_id);
    const scene = sv.scenes.find((s) => s.index === sceneIndex);
    if (!scene) {
      throw new Error(`scene job ${job.id}: script has no scene ${sceneIndex}`);
    }
    prompt = scene.broll_prompt;
    modelPath ||= scene.model_path;

    if (!durationHint) {
      const voiceover = await getLatestAsset(job.video_id, 'voiceover');
      const words = (voiceover?.meta.word_timestamps ?? []) as WordTimestamp[];
      if (voiceover && words.length > 0) {
        const script: Script = { hook: sv.hook, scenes: sv.scenes, cta: sv.cta };
        const totalS = Math.max(voiceover.duration_s || 0, words[words.length - 1].end);
        const win = computeSceneCoverageWindows(script, words, totalS).find(
          (w) => w.section === `scene_${sceneIndex}`,
        );
        if (win) durationHint = Math.ceil(win.end - win.start);
      }
    }
  }
  if (!prompt) {
    throw new Error(`scene job ${job.id}: scene ${sceneIndex} has no b-roll prompt`);
  }
  modelPath ||= DEFAULT_SCENE_MODEL;
  if (!durationHint) durationHint = 8;

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
