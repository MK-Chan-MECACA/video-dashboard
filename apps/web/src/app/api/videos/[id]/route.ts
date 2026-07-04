import { NextResponse } from 'next/server';
import type { VideoStatus } from '@vd/shared';
import { requireOperator } from '@/lib/supabase';
import { sessionError } from '@/lib/apiResponse';
import { deleteVideo, updateVideo } from '@/lib/videos';

type Params = { params: Promise<{ id: string }> };

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

  try {
    await updateVideo(supabase, id, { status: body.status, video_no: body.video_no });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return sessionError(e);
  }
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

  try {
    const { deleted } = await deleteVideo(supabase, id);
    return NextResponse.json({ ok: true, deleted });
  } catch (e) {
    return sessionError(e);
  }
}
