import { NextResponse } from 'next/server';
import { resolveReviewToken, rateLimit } from '@/lib/review';

type Params = { params: Promise<{ token: string }> };

/**
 * Reviewer decision. Body: { decision: 'approved' | 'changes_requested', comment?, reviewer_name? }
 * Script approval kicks off the generation pipeline (tts job → worker takes over).
 * Video approval kicks off caption + GHL scheduling.
 */
export async function POST(req: Request, { params }: Params) {
  const { token } = await params;
  if (!rateLimit(token, 10)) return new NextResponse('Too many requests', { status: 429 });
  const resolved = await resolveReviewToken(token);
  if (!resolved) return new NextResponse('Invalid or expired link', { status: 404 });
  const { db, link } = resolved;

  const body = (await req.json()) as {
    decision: 'approved' | 'changes_requested';
    comment?: string;
    reviewer_name?: string;
  };
  if (body.decision !== 'approved' && body.decision !== 'changes_requested') {
    return new NextResponse('Invalid decision', { status: 400 });
  }
  if (body.decision === 'changes_requested' && !body.comment?.trim()) {
    return new NextResponse('Please describe the changes you need', { status: 400 });
  }

  const { data: video } = await db.from('videos').select('*').eq('id', link.video_id).single();
  if (!video) return new NextResponse('Video not found', { status: 404 });

  const expectedStatus = link.kind === 'script' ? 'script_review' : 'video_review';
  if (video.status !== expectedStatus) {
    return new NextResponse(
      `This ${link.kind} is not awaiting review (current status: ${video.status})`,
      { status: 409 },
    );
  }

  await db.from('approvals').insert({
    video_id: link.video_id,
    review_link_id: link.id,
    kind: link.kind,
    decision: body.decision,
    comment: body.comment?.trim() || null,
    reviewer_name: body.reviewer_name?.trim() || 'Reviewer',
  });

  if (body.decision === 'changes_requested') {
    const next = link.kind === 'script' ? 'script_changes_requested' : 'video_changes_requested';
    await db.from('videos').update({ status: next }).eq('id', link.video_id);
    if (body.comment?.trim()) {
      await db.from('review_comments').insert({
        video_id: link.video_id,
        review_link_id: link.id,
        section_key: link.kind === 'video' ? 'video' : 'hook',
        author_name: body.reviewer_name?.trim() || 'Reviewer',
        body: body.comment.trim(),
      });
    }
    await db.from('pipeline_events').insert({
      video_id: link.video_id,
      event: `${link.kind}_changes_requested`,
      detail: { reviewer: body.reviewer_name },
    });
    return NextResponse.json({ ok: true });
  }

  if (link.kind === 'script') {
    // Approved script → start generation. Voice comes from settings; worker consumes payload.
    const { data: voiceSetting } = await db
      .from('app_settings')
      .select('value')
      .eq('key', 'heygen_voice_id')
      .maybeSingle();
    await db.from('videos').update({ status: 'voice_generating' }).eq('id', link.video_id);
    await db.from('jobs').insert({
      video_id: link.video_id,
      type: 'tts',
      payload: { voice_id: voiceSetting?.value ?? null },
    });
    await db.from('pipeline_events').insert({
      video_id: link.video_id,
      event: 'script_approved',
      detail: { reviewer: body.reviewer_name },
    });
  } else {
    await db.from('videos').update({ status: 'approved' }).eq('id', link.video_id);
    await db.from('jobs').insert({ video_id: link.video_id, type: 'generate_caption', payload: {} });
    await db.from('pipeline_events').insert({
      video_id: link.video_id,
      event: 'video_approved',
      detail: { reviewer: body.reviewer_name },
    });
  }

  return NextResponse.json({ ok: true });
}
