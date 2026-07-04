import { NextResponse } from 'next/server';
import { resolveReviewToken, rateLimit } from '@/lib/review';
import { sessionError } from '@/lib/apiResponse';
import { applyReviewDecision } from '@/lib/videos';

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

  try {
    await applyReviewDecision(db, link.video_id, {
      kind: link.kind,
      decision: body.decision,
      comment: body.comment,
      reviewer_name: body.reviewer_name,
      review_link_id: link.id,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return sessionError(e);
  }
}
