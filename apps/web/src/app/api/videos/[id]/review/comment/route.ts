import { NextResponse } from 'next/server';
import { requireUser, supabaseAdmin } from '@/lib/supabase';
import { sessionError } from '@/lib/apiResponse';

type Params = { params: Promise<{ id: string }> };

/** Logged-in reviewer comment — session counterpart of /api/review/[token]/comment. */
export async function POST(req: Request, { params }: Params) {
  const { id } = await params;
  try {
    const { user } = await requireUser();
    const body = (await req.json()) as {
      kind: 'script' | 'video';
      section_key: string;
      body: string;
      video_timestamp_s?: number;
    };
    if (!body.body?.trim()) return new NextResponse('Comment is empty', { status: 400 });

    const db = supabaseAdmin();
    const { data: video } = await db
      .from('videos')
      .select('current_script_version_id')
      .eq('id', id)
      .single();
    if (!video) return new NextResponse('Video not found', { status: 404 });

    const { error } = await db.from('review_comments').insert({
      video_id: id,
      script_version_id: body.kind === 'script' ? video.current_script_version_id : null,
      review_link_id: null,
      section_key: body.section_key || (body.kind === 'video' ? 'video' : 'hook'),
      video_timestamp_s: body.video_timestamp_s ?? null,
      author_name: user.email ?? 'Reviewer',
      body: body.body.trim(),
      reviewer_user_id: user.id,
      reviewer_email: user.email ?? null,
    });
    if (error) return new NextResponse(error.message, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return sessionError(e);
  }
}
