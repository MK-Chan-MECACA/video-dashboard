import { NextResponse } from 'next/server';
import { BOARD_COLUMNS, type VideoStatus } from '@vd/shared';
import { requireOperator } from '@/lib/supabase';

type Params = { params: Promise<{ id: string }> };

const VALID_STATUSES = new Set<VideoStatus>(BOARD_COLUMNS.flatMap((c) => c.statuses));

/** Statuses where the worker is actively producing — deletion would strand jobs. */
const ACTIVE_STATUSES: VideoStatus[] = [
  'script_generating',
  'voice_generating',
  'avatar_generating',
  'scenes_generating',
  'rendering',
];

/** Operator video admin: change status (board drag & drop) or reassign video_no. */
export async function PATCH(req: Request, { params }: Params) {
  let supabase;
  try {
    ({ supabase } = await requireOperator());
  } catch {
    return new NextResponse('Unauthorized', { status: 401 });
  }
  const { id } = await params;
  const body = (await req.json()) as { status?: VideoStatus; video_no?: number };

  const patch: Record<string, unknown> = {};
  if (body.status !== undefined) {
    if (!VALID_STATUSES.has(body.status)) {
      return new NextResponse(`Invalid status: ${body.status}`, { status: 400 });
    }
    patch.status = body.status;
  }
  if (body.video_no !== undefined) {
    if (!Number.isInteger(body.video_no) || body.video_no < 1) {
      return new NextResponse('Video number must be a positive whole number', { status: 400 });
    }
    patch.video_no = body.video_no;
  }
  if (Object.keys(patch).length === 0) {
    return new NextResponse('Nothing to update', { status: 400 });
  }

  const { error } = await supabase.from('videos').update(patch).eq('id', id);
  if (error) {
    if (error.code === '23505') {
      return new NextResponse(
        `V${body.video_no} is already taken by another video — pick an unused number`,
        { status: 409 },
      );
    }
    return new NextResponse(error.message, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

/** Delete a video and everything belonging to it (cascades in the DB). */
export async function DELETE(req: Request, { params }: Params) {
  let supabase;
  try {
    ({ supabase } = await requireOperator());
  } catch {
    return new NextResponse('Unauthorized', { status: 401 });
  }
  const { id } = await params;

  const { data: video } = await supabase
    .from('videos')
    .select('status, video_no, title')
    .eq('id', id)
    .single();
  if (!video) return new NextResponse('Video not found', { status: 404 });

  if (ACTIVE_STATUSES.includes(video.status as VideoStatus)) {
    return new NextResponse(
      'This video is being processed right now — wait for the current step to finish (or fail) before deleting',
      { status: 409 },
    );
  }

  const { error } = await supabase.from('videos').delete().eq('id', id);
  if (error) return new NextResponse(error.message, { status: 500 });
  return NextResponse.json({ ok: true, deleted: `V${video.video_no} ${video.title}` });
}
