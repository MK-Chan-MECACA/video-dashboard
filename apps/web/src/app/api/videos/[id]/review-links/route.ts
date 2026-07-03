import { NextResponse } from 'next/server';
import { requireOperator } from '@/lib/supabase';
import { newReviewToken } from '@/lib/tokens';
import { appUrl } from '@/lib/services';

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
  if (kind !== 'script' && kind !== 'video') {
    return new NextResponse('kind must be script or video', { status: 400 });
  }

  const { token, tokenHash } = newReviewToken();
  const { error } = await supabase.from('review_links').insert({
    video_id: id,
    kind,
    token_hash: tokenHash,
  });
  if (error) return new NextResponse(error.message, { status: 500 });

  return NextResponse.json({ url: `${appUrl()}/review/${token}` });
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
  const { error } = await supabase
    .from('review_links')
    .update({ revoked: true })
    .eq('id', link_id)
    .eq('video_id', id);
  if (error) return new NextResponse(error.message, { status: 500 });
  return NextResponse.json({ ok: true });
}
