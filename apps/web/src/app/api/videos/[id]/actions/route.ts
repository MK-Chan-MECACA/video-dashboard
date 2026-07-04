import { NextResponse } from 'next/server';
import { requireOperator } from '@/lib/supabase';
import { sessionError } from '@/lib/apiResponse';
import { performVideoAction, updateVideo, type VideoActionName } from '@/lib/videos';

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

  try {
    if (body.action === 'update_meta') {
      await updateVideo(supabase, id, {
        caption: body.caption,
        schedule_at: body.schedule_at,
        title: body.title,
        topic_brief: body.topic_brief,
      });
    } else {
      await performVideoAction(supabase, id, {
        action: body.action as VideoActionName,
        scene_index: body.scene_index,
      });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return sessionError(e);
  }
}
