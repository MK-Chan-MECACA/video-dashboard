import { NextResponse } from 'next/server';
import { generateScript } from '@vd/shared';
import { requireOperator } from '@/lib/supabase';
import { getScriptGenContext, logEvent, saveScriptVersion } from '@/lib/scripts';

export const maxDuration = 120;

export async function POST(req: Request) {
  let supabase;
  try {
    ({ supabase } = await requireOperator());
  } catch {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  const body = (await req.json()) as {
    title: string;
    topic_brief?: string;
    generate?: boolean;
  };
  if (!body.title?.trim()) return new NextResponse('Title is required', { status: 400 });

  const { data: video, error } = await supabase
    .from('videos')
    .insert({
      title: body.title.trim(),
      topic_brief: body.topic_brief?.trim() || null,
      status: body.generate ? 'script_generating' : 'draft',
    })
    .select()
    .single();
  if (error) return new NextResponse(error.message, { status: 500 });

  await logEvent(supabase, video.id, 'video_created');

  if (body.generate && body.topic_brief?.trim()) {
    try {
      const { systemPrompt, recentScripts } = await getScriptGenContext(supabase, {
        excludeVideoId: video.id,
      });
      const script = await generateScript({
        apiKey: process.env.ANTHROPIC_API_KEY!,
        topicBrief: body.topic_brief,
        systemPrompt,
        recentScripts,
      });
      await saveScriptVersion(supabase, {
        videoId: video.id,
        script,
        createdBy: 'claude',
        claudeModel: script.model,
      });
      await supabase.from('videos').update({ status: 'draft' }).eq('id', video.id);
      await logEvent(supabase, video.id, 'script_generated', { version: 1 });
    } catch (e) {
      await supabase
        .from('videos')
        .update({ status: 'draft', status_error: String(e) })
        .eq('id', video.id);
    }
  }

  return NextResponse.json({ id: video.id });
}
