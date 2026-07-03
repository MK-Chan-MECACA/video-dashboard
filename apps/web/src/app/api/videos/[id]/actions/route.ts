import { NextResponse } from 'next/server';
import { requireOperator } from '@/lib/supabase';
import { logEvent } from '@/lib/scripts';

type Params = { params: Promise<{ id: string }> };

/**
 * Operator actions on a video:
 *  send_for_review | update_meta {caption?, schedule_at?, title?, topic_brief?}
 *  retry_failed | regenerate_scene {scene_index} | regenerate_avatar | re_render
 */
export async function POST(req: Request, { params }: Params) {
  let supabase;
  try {
    ({ supabase } = await requireOperator());
  } catch {
    return new NextResponse('Unauthorized', { status: 401 });
  }
  const { id } = await params;
  const body = (await req.json()) as {
    action: string;
    caption?: string;
    schedule_at?: string | null;
    title?: string;
    topic_brief?: string;
    scene_index?: number;
  };

  const { data: video } = await supabase.from('videos').select('*').eq('id', id).single();
  if (!video) return new NextResponse('Video not found', { status: 404 });

  switch (body.action) {
    case 'send_for_review': {
      if (!video.current_script_version_id) {
        return new NextResponse('No script to review yet', { status: 400 });
      }
      await supabase.from('videos').update({ status: 'script_review' }).eq('id', id);
      await logEvent(supabase, id, 'sent_for_script_review');
      return NextResponse.json({ ok: true });
    }
    case 'update_meta': {
      const patch: Record<string, unknown> = {};
      if (body.caption !== undefined) patch.caption = body.caption;
      if (body.schedule_at !== undefined) patch.schedule_at = body.schedule_at;
      if (body.title !== undefined) patch.title = body.title;
      if (body.topic_brief !== undefined) patch.topic_brief = body.topic_brief;
      const { error } = await supabase.from('videos').update(patch).eq('id', id);
      if (error) return new NextResponse(error.message, { status: 500 });
      return NextResponse.json({ ok: true });
    }
    case 'retry_failed': {
      // Reset failed jobs; the worker recomputes video status as jobs progress.
      const { error } = await supabase
        .from('jobs')
        .update({ status: 'queued', attempts: 0, error: null, run_after: new Date().toISOString() })
        .eq('video_id', id)
        .eq('status', 'failed');
      if (error) return new NextResponse(error.message, { status: 500 });
      await supabase.from('videos').update({ status_error: null }).eq('id', id);
      await logEvent(supabase, id, 'retry_failed_jobs');
      return NextResponse.json({ ok: true });
    }
    case 'regenerate_scene': {
      if (!body.scene_index) return new NextResponse('scene_index required', { status: 400 });
      const { error } = await supabase.from('jobs').insert({
        video_id: id,
        type: 'scene',
        payload: { scene_index: body.scene_index, regenerate: true },
      });
      if (error) return new NextResponse(error.message, { status: 500 });
      await logEvent(supabase, id, 'scene_regenerate_requested', { scene_index: body.scene_index });
      return NextResponse.json({ ok: true });
    }
    case 'regenerate_avatar': {
      const { error } = await supabase
        .from('jobs')
        .insert({ video_id: id, type: 'avatar', payload: { regenerate: true } });
      if (error) return new NextResponse(error.message, { status: 500 });
      await logEvent(supabase, id, 'avatar_regenerate_requested');
      return NextResponse.json({ ok: true });
    }
    case 're_render': {
      const { error } = await supabase
        .from('jobs')
        .insert({ video_id: id, type: 'render', payload: { rerender: true } });
      if (error) return new NextResponse(error.message, { status: 500 });
      await logEvent(supabase, id, 're_render_requested');
      return NextResponse.json({ ok: true });
    }
    default:
      return new NextResponse(`Unknown action: ${body.action}`, { status: 400 });
  }
}
