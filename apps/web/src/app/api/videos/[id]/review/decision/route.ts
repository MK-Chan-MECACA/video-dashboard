import { NextResponse } from 'next/server';
import { requireUser, supabaseAdmin } from '@/lib/supabase';
import { sessionError } from '@/lib/apiResponse';
import { applyReviewDecision } from '@/lib/videos';

type Params = { params: Promise<{ id: string }> };

/**
 * Logged-in reviewer decision (operator or client) — no review link token needed.
 * Body: { kind: 'script' | 'video', decision: 'approved' | 'changes_requested', comment? }
 * Uses the admin client because the decision touches operator-only tables
 * (videos.status, jobs, pipeline_events); the session role is the credential.
 */
export async function POST(req: Request, { params }: Params) {
  const { id } = await params;
  try {
    const { user } = await requireUser();
    const body = (await req.json()) as {
      kind: 'script' | 'video';
      decision: 'approved' | 'changes_requested';
      comment?: string;
    };
    await applyReviewDecision(supabaseAdmin(), id, {
      kind: body.kind,
      decision: body.decision,
      comment: body.comment,
      reviewer_name: user.email ?? 'Reviewer',
      review_link_id: null,
      reviewer_user_id: user.id,
      reviewer_email: user.email ?? undefined,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return sessionError(e);
  }
}
