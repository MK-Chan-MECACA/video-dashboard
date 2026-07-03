import { NextResponse } from 'next/server';
import { requireOperator } from '@/lib/supabase';
import { r2 } from '@/lib/services';

type Params = { params: Promise<{ id: string }> };

/** Operator-only media access for brand assets: redirects to a short-lived presigned R2 URL. */
export async function GET(_req: Request, { params }: Params) {
  let supabase;
  try {
    ({ supabase } = await requireOperator());
  } catch {
    return new NextResponse('Unauthorized', { status: 401 });
  }
  const { id } = await params;
  const { data: asset } = await supabase
    .from('brand_assets')
    .select('id, r2_key')
    .eq('id', id)
    .maybeSingle();
  if (!asset) return new NextResponse('Not found', { status: 404 });

  const signed = await r2().presignGet(asset.r2_key, 3600);
  return NextResponse.redirect(signed);
}
