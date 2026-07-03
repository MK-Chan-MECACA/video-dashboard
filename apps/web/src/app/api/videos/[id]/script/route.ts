import { NextResponse } from 'next/server';
import { generateScript, type Script, type ScriptVersion } from '@vd/shared';
import { requireOperator } from '@/lib/supabase';
import { getScriptGenContext, logEvent, saveScriptVersion } from '@/lib/scripts';

export const maxDuration = 120;

type Params = { params: Promise<{ id: string }> };

/** Save an operator-edited script as a new version. */
export async function PUT(req: Request, { params }: Params) {
  let supabase;
  try {
    ({ supabase } = await requireOperator());
  } catch {
    return new NextResponse('Unauthorized', { status: 401 });
  }
  const { id } = await params;
  const script = (await req.json()) as Script;

  try {
    const version = await saveScriptVersion(supabase, {
      videoId: id,
      script,
      createdBy: 'operator',
    });
    await logEvent(supabase, id, 'script_edited', { version: version.version });
    return NextResponse.json({ version_id: version.id });
  } catch (e) {
    return new NextResponse(String(e), { status: 500 });
  }
}

/** Regenerate with Claude (optionally revising the current version with instructions). */
export async function POST(req: Request, { params }: Params) {
  let supabase;
  try {
    ({ supabase } = await requireOperator());
  } catch {
    return new NextResponse('Unauthorized', { status: 401 });
  }
  const { id } = await params;
  const body = (await req.json()) as { instructions?: string; fresh?: boolean };

  const { data: video } = await supabase.from('videos').select('*').eq('id', id).single();
  if (!video) return new NextResponse('Video not found', { status: 404 });

  let previous: Script | undefined;
  if (!body.fresh && video.current_script_version_id) {
    const { data: cur } = await supabase
      .from('script_versions')
      .select('*')
      .eq('id', video.current_script_version_id)
      .single();
    if (cur) {
      const v = cur as ScriptVersion;
      previous = { hook: v.hook, cta: v.cta, scenes: v.scenes };
    }
  }

  // Fold in unresolved reviewer comments so regeneration addresses them.
  const { data: comments } = await supabase
    .from('review_comments')
    .select('section_key, body')
    .eq('video_id', id)
    .eq('resolved', false);
  const feedback = (comments ?? [])
    .map((c) => `[${c.section_key}] ${c.body}`)
    .join('\n');

  try {
    const { systemPrompt, recentScripts } = await getScriptGenContext(supabase, {
      excludeVideoId: id,
    });
    const script = await generateScript({
      apiKey: process.env.ANTHROPIC_API_KEY!,
      topicBrief: video.topic_brief ?? video.title,
      previousScript: previous,
      instructions: [body.instructions, feedback && `Reviewer comments:\n${feedback}`]
        .filter(Boolean)
        .join('\n\n'),
      systemPrompt,
      recentScripts,
    });
    const version = await saveScriptVersion(supabase, {
      videoId: id,
      script,
      createdBy: 'claude',
      claudeModel: script.model,
    });
    if (video.status === 'script_generating' || video.status === 'script_changes_requested') {
      await supabase.from('videos').update({ status: 'draft' }).eq('id', id);
    }
    await logEvent(supabase, id, 'script_regenerated', { version: version.version });
    return NextResponse.json({ version_id: version.id });
  } catch (e) {
    return new NextResponse(String(e), { status: 500 });
  }
}
