import { NextResponse } from 'next/server';
import { resolveReviewToken, rateLimit } from '@/lib/review';

type Params = { params: Promise<{ token: string }> };

export async function POST(req: Request, { params }: Params) {
  const { token } = await params;
  if (!rateLimit(token)) return new NextResponse('Too many requests', { status: 429 });
  const resolved = await resolveReviewToken(token);
  if (!resolved) return new NextResponse('Invalid or expired link', { status: 404 });
  const { db, link } = resolved;

  const body = (await req.json()) as {
    section_key: string;
    body: string;
    author_name?: string;
    video_timestamp_s?: number;
  };
  if (!body.body?.trim()) return new NextResponse('Comment is empty', { status: 400 });

  const { data: video } = await db
    .from('videos')
    .select('current_script_version_id')
    .eq('id', link.video_id)
    .single();

  const { error } = await db.from('review_comments').insert({
    video_id: link.video_id,
    script_version_id: link.kind === 'script' ? video?.current_script_version_id : null,
    review_link_id: link.id,
    section_key: body.section_key || (link.kind === 'video' ? 'video' : 'hook'),
    video_timestamp_s: body.video_timestamp_s ?? null,
    author_name: body.author_name?.trim() || 'Reviewer',
    body: body.body.trim(),
  });
  if (error) return new NextResponse(error.message, { status: 500 });
  return NextResponse.json({ ok: true });
}
