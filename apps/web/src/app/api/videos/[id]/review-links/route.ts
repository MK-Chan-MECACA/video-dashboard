import { NextResponse } from 'next/server';
import { requireOperator } from '@/lib/supabase';
import { sessionError } from '@/lib/apiResponse';
import { createReviewLink, revokeReviewLink } from '@/lib/videos';

type Params = { params: Promise<{ id: string }> };

/** Create a magic review link. Body: { kind: 'script' | 'video' } */
export async function POST(req: Request, { params }: Params) {
  let supabase;
  try {
    ({ supabase } = await requireOperator());
  } catch {
    return new NextResponse('Unauthorized', { status: 401 });
  }
  const { id } = await params;
  const { kind } = (await req.json()) as { kind: 'script' | 'video' };

  try {
    return NextResponse.json(await createReviewLink(supabase, id, kind));
  } catch (e) {
    return sessionError(e);
  }
}

/** Revoke a link. Body: { link_id } */
export async function DELETE(req: Request, { params }: Params) {
  let supabase;
  try {
    ({ supabase } = await requireOperator());
  } catch {
    return new NextResponse('Unauthorized', { status: 401 });
  }
  const { id } = await params;
  const { link_id } = (await req.json()) as { link_id: string };

  try {
    await revokeReviewLink(supabase, id, link_id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return sessionError(e);
  }
}
