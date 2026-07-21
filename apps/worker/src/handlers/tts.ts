import {
  DEFAULT_SCENE_MODEL,
  computeSceneCoverageWindows,
  fullVoiceoverText,
  resolveTargetDurationS,
  type Job,
  type Script,
} from '@vd/shared';
import { heygen, r2 } from '../clients';
import {
  completeJob,
  enqueueJob,
  getAppSetting,
  getScriptVersion,
  getVideo,
  insertAsset,
  logEvent,
  setVideoStatus,
} from '../db';
import { optionalEnv } from '../env';

export async function handleTts(job: Job): Promise<void> {
  const video = await getVideo(job.video_id);
  if (!video.current_script_version_id) {
    throw new Error(`Video ${video.id} has no current script version`);
  }
  const sv = await getScriptVersion(video.current_script_version_id);
  const script: Script = { hook: sv.hook, scenes: sv.scenes, cta: sv.cta };
  const text = fullVoiceoverText(script);
  if (!text) throw new Error(`Script ${sv.id} produced empty voiceover text`);

  // Resolve the voice at run time, settings first: a payload voice_id is only
  // a stale settings snapshot from the old approval flow, and reading the live
  // setting lets "Retry failed" pick up a voice changed after the failure.
  const voiceId =
    ((await getAppSetting('heygen_voice_id')) as string | null) ??
    (job.payload.voice_id as string | undefined) ??
    optionalEnv('HEYGEN_VOICE_ID');
  if (!voiceId) throw new Error('No voice_id in payload/settings and HEYGEN_VOICE_ID is not set');

  const speech = await heygen().generateSpeech({ text, voiceId });
  if (speech.wordTimestamps.length === 0) {
    throw new Error('HeyGen returned no word timestamps (needed for subtitles + scene windows)');
  }

  const key = `videos/${video.id}/voiceover.mp3`;
  const sizeBytes = await r2().putFromUrl(key, speech.audioUrl, 'audio/mpeg');
  await insertAsset({
    video_id: video.id,
    kind: 'voiceover',
    r2_key: key,
    duration_s: speech.duration || null,
    size_bytes: sizeBytes,
    meta: { word_timestamps: speech.wordTimestamps, heygen_duration: speech.duration },
  });
  await logEvent(video.id, 'voiceover_generated', {
    job_id: job.id,
    duration_s: speech.duration,
    words: speech.wordTimestamps.length,
  });

  // Visibility backstop: a script that slipped past review too long (or a
  // slower-than-expected voice) shows up in the timeline before avatar and
  // B-roll credits are spent. Never fails the job.
  const targetS = resolveTargetDurationS(await getAppSetting('target_duration_s'));
  if (speech.duration && speech.duration > targetS * 1.25) {
    await logEvent(video.id, 'voiceover_over_target', {
      duration_s: speech.duration,
      target_s: targetS,
      words: speech.wordTimestamps.length,
    });
  }

  await setVideoStatus(video.id, 'avatar_generating', { job_id: job.id });

  await enqueueJob(video.id, 'avatar', {});
  // Voice regeneration keeps the existing B-roll clips (each scene is a paid
  // WaveSpeed generation) — the operator regenerates scenes individually when
  // the script change moved their beats. First-time TTS enqueues all three.
  if (!job.payload.regenerate) {
    // The three B-roll scenes must tile the whole voiceover (scene 1 covers the
    // hook, scene 3 the CTA) so the full-screen avatar never shows. Ask the
    // video model for at least the coverage window, rounded up.
    const totalS = Math.max(
      speech.duration || 0,
      speech.wordTimestamps[speech.wordTimestamps.length - 1].end,
    );
    const windows = computeSceneCoverageWindows(script, speech.wordTimestamps, totalS);
    for (const scene of sv.scenes) {
      const win = windows.find((w) => w.section === `scene_${scene.index}`);
      await enqueueJob(video.id, 'scene', {
        scene_index: scene.index,
        model_path: scene.model_path || DEFAULT_SCENE_MODEL,
        prompt: scene.broll_prompt,
        duration_hint: win ? Math.ceil(win.end - win.start) : 8,
      });
    }
  }

  await completeJob(job.id);
}
