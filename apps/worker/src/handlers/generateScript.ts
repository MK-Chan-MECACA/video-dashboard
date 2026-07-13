import {
  effectiveSpokenTargetS,
  estimateOutroDurationS,
  fullVoiceoverText,
  generateScript,
  resolveTargetDurationS,
  resolveTargetIncludesOutro,
  type Job,
  type PastScript,
  type Script,
  type ScriptVersion,
} from '@vd/shared';
import {
  completeJob,
  db,
  getAppSetting,
  getBrandAsset,
  getScriptVersion,
  getVideo,
  logEvent,
  setVideoStatus,
} from '../db';
import { requiredEnv } from '../env';

/** 'failed' allows the Retry-failed action to re-run a permanently failed job. */
const REVISABLE = new Set(['script_changes_requested', 'failed']);

/**
 * Auto-revise: regenerate the script from the reviewer's unresolved comments
 * and send it straight back to review. Enqueued by applyReviewDecision when a
 * reviewer requests changes on a script.
 */
export async function handleGenerateScript(job: Job): Promise<void> {
  const video = await getVideo(job.video_id);
  if (!REVISABLE.has(video.status)) {
    // Operator already handled it (manual regenerate or send-for-review).
    console.log(`[generate_script] skip: video ${video.id} is ${video.status}`);
    await completeJob(job.id);
    return;
  }
  const s = db();

  let previous: Script | undefined;
  if (video.current_script_version_id) {
    const sv = await getScriptVersion(video.current_script_version_id);
    previous = { hook: sv.hook, cta: sv.cta, scenes: sv.scenes };
  }

  // Capture ids now — comments added mid-generation stay unresolved for the next round.
  const comments = await s<{ id: string; section_key: string; body: string }[]>`
    select id, section_key, body from review_comments
    where video_id = ${video.id} and resolved = false
  `;
  const feedback = comments.map((c) => `[${c.section_key}] ${c.body}`).join('\n');

  const [sysPrompt, targetRaw, includesRaw, outro, recent] = await Promise.all([
    getAppSetting('script_system_prompt'),
    getAppSetting('target_duration_s'),
    getAppSetting('target_duration_includes_outro'),
    getBrandAsset('outro'),
    s<PastScript[]>`
      select v.title, sv.hook from videos v
      join script_versions sv on sv.id = v.current_script_version_id
      where v.id <> ${video.id}
      order by v.created_at desc limit 20
    `,
  ]);
  const targetDurationS = effectiveSpokenTargetS(
    resolveTargetDurationS(targetRaw),
    resolveTargetIncludesOutro(includesRaw),
    estimateOutroDurationS(outro),
  );

  const script = await generateScript({
    apiKey: requiredEnv('ANTHROPIC_API_KEY'),
    topicBrief: video.topic_brief ?? video.title,
    previousScript: previous,
    instructions: feedback ? `Reviewer comments:\n${feedback}` : undefined,
    systemPrompt: typeof sysPrompt === 'string' ? sysPrompt : undefined,
    recentScripts: recent.filter((r) => r.hook),
    targetDurationS,
  });

  // Re-check after the long LLM call: the operator may have regenerated or
  // sent for review meanwhile — their version wins.
  const fresh = await getVideo(video.id);
  if (!REVISABLE.has(fresh.status)) {
    console.log(`[generate_script] discard: video ${video.id} moved to ${fresh.status} during generation`);
    await completeJob(job.id);
    return;
  }

  const [sv] = await s<ScriptVersion[]>`
    insert into script_versions (video_id, version, hook, cta, scenes, full_voiceover_text, created_by, claude_model)
    select ${video.id}, coalesce(max(version), 0) + 1, ${script.hook}, ${script.cta},
           ${s.json(script.scenes as never)}, ${fullVoiceoverText(script)}, 'claude', ${script.model}
    from script_versions where video_id = ${video.id}
    returning *
  `;
  await s`update videos set current_script_version_id = ${sv.id} where id = ${video.id}`;

  if (comments.length) {
    await s`update review_comments set resolved = true where id in ${s(comments.map((c) => c.id))}`;
  }

  await logEvent(video.id, 'script_regenerated', {
    job_id: job.id,
    version: sv.version,
    words: script.wordCount,
    estimated_s: Math.round(script.estimatedDurationS),
    target_s: targetDurationS,
    condense_attempts: script.condenseAttempts,
    comments_resolved: comments.length,
  });
  await setVideoStatus(video.id, 'script_review');
  await logEvent(video.id, 'sent_for_script_review');
  await completeJob(job.id);
}
