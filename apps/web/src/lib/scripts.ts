import type { SupabaseClient } from '@supabase/supabase-js';
import { fullVoiceoverText, type PastScript, type Script, type ScriptVersion } from '@vd/shared';

/**
 * Context for Claude script generation: the operator's custom system prompt
 * (Settings → "Claude script generator") and the recent-script memory so new
 * scripts don't repeat earlier hooks/angles.
 */
export async function getScriptGenContext(
  db: SupabaseClient,
  opts: { excludeVideoId?: string } = {},
): Promise<{ systemPrompt?: string; recentScripts: PastScript[] }> {
  const [{ data: setting }, { data: videos }] = await Promise.all([
    db.from('app_settings').select('value').eq('key', 'script_system_prompt').maybeSingle(),
    db
      .from('videos')
      .select('id, title, current_script_version_id')
      .not('current_script_version_id', 'is', null)
      .order('created_at', { ascending: false })
      .limit(21),
  ]);

  const rows = (videos ?? []).filter((v) => v.id !== opts.excludeVideoId).slice(0, 20);
  let recentScripts: PastScript[] = [];
  if (rows.length) {
    const { data: versions } = await db
      .from('script_versions')
      .select('id, hook')
      .in(
        'id',
        rows.map((v) => v.current_script_version_id),
      );
    const hookById = new Map((versions ?? []).map((v) => [v.id, v.hook as string]));
    recentScripts = rows
      .map((v) => ({ title: v.title as string, hook: hookById.get(v.current_script_version_id) ?? '' }))
      .filter((s) => s.hook);
  }

  const systemPrompt = typeof setting?.value === 'string' ? setting.value : undefined;
  return { systemPrompt, recentScripts };
}

/** Insert a new script version and point the video at it. */
export async function saveScriptVersion(
  db: SupabaseClient,
  opts: {
    videoId: string;
    script: Script;
    createdBy: 'claude' | 'operator';
    claudeModel?: string;
  },
): Promise<ScriptVersion> {
  const { data: latest } = await db
    .from('script_versions')
    .select('version')
    .eq('video_id', opts.videoId)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle();

  const version = (latest?.version ?? 0) + 1;
  const { data, error } = await db
    .from('script_versions')
    .insert({
      video_id: opts.videoId,
      version,
      hook: opts.script.hook,
      cta: opts.script.cta,
      scenes: opts.script.scenes,
      full_voiceover_text: fullVoiceoverText(opts.script),
      created_by: opts.createdBy,
      claude_model: opts.claudeModel ?? null,
    })
    .select()
    .single();
  if (error) throw new Error(error.message);

  const { error: linkErr } = await db
    .from('videos')
    .update({ current_script_version_id: data.id })
    .eq('id', opts.videoId);
  if (linkErr) throw new Error(linkErr.message);

  return data as ScriptVersion;
}

export async function logEvent(
  db: SupabaseClient,
  videoId: string,
  event: string,
  detail: Record<string, unknown> = {},
) {
  await db.from('pipeline_events').insert({ video_id: videoId, event, detail });
}
