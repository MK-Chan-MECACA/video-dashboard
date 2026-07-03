import { NextResponse } from 'next/server';
import { supabaseAdmin, supabaseServer } from '@/lib/supabase';
import { resolveReviewToken } from '@/lib/review';
import { r2 } from '@/lib/services';

type Params = { params: Promise<{ assetId: string }> };

/**
 * Media access: redirects to a short-lived presigned R2 URL.
 * Allowed for the logged-in operator, or for a valid review token (?t=...)
 * belonging to the asset's video.
 */
export async function GET(req: Request, { params }: Params) {
  const { assetId } = await params;
  const url = new URL(req.url);
  const reviewToken = url.searchParams.get('t');

  const admin = supabaseAdmin();
  const { data: asset } = await admin
    .from('assets')
    .select('id, video_id, r2_key')
    .eq('id', assetId)
    .maybeSingle();
  if (!asset) return new NextResponse('Not found', { status: 404 });

  let allowed = false;
  if (reviewToken) {
    const resolved = await resolveReviewToken(reviewToken);
    allowed = !!resolved && resolved.link.video_id === asset.video_id;
  }
  if (!allowed) {
    const supabase = await supabaseServer();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    allowed = !!user;
  }
  if (!allowed) return new NextResponse('Unauthorized', { status: 401 });

  const signed = await r2().presignGet(asset.r2_key, 3600);
  return NextResponse.redirect(signed);
}
