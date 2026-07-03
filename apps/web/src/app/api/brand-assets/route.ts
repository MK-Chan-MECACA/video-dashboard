import { NextResponse } from 'next/server';
import { requireOperator } from '@/lib/supabase';
import { r2 } from '@/lib/services';
import type { BrandAssetKind } from '@vd/shared';

const CONTENT_TYPES: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  wav: 'audio/wav',
  mp4: 'video/mp4',
  mov: 'video/quicktime',
};

/** Step 1: get a presigned PUT for a direct browser upload. Body: { kind, filename } */
export async function POST(req: Request) {
  try {
    await requireOperator();
  } catch {
    return new NextResponse('Unauthorized', { status: 401 });
  }
  const body = (await req.json()) as {
    kind: BrandAssetKind;
    filename: string;
    // Step 2 (after upload): confirm with key + name + is_default
    confirm?: boolean;
    key?: string;
    name?: string;
    is_default?: boolean;
  };

  if (body.confirm) {
    const { supabase } = await requireOperator();
    if (!body.key || !body.name) return new NextResponse('key and name required', { status: 400 });
    if (body.is_default) {
      await supabase.from('brand_assets').update({ is_default: false }).eq('kind', body.kind);
    }
    const { data, error } = await supabase
      .from('brand_assets')
      .insert({
        kind: body.kind,
        name: body.name,
        r2_key: body.key,
        is_default: body.is_default ?? false,
      })
      .select()
      .single();
    if (error) return new NextResponse(error.message, { status: 500 });
    return NextResponse.json(data);
  }

  const ext = body.filename.split('.').pop()?.toLowerCase() ?? 'bin';
  const contentType = CONTENT_TYPES[ext] ?? 'application/octet-stream';
  const key = `brand/${body.kind}/${Date.now()}-${body.filename.replace(/[^\w.-]/g, '_')}`;
  const uploadUrl = await r2().presignPut(key, contentType);
  return NextResponse.json({ uploadUrl, key, contentType });
}

export async function DELETE(req: Request) {
  let supabase;
  try {
    ({ supabase } = await requireOperator());
  } catch {
    return new NextResponse('Unauthorized', { status: 401 });
  }
  const { id } = (await req.json()) as { id: string };
  const { error } = await supabase.from('brand_assets').delete().eq('id', id);
  if (error) return new NextResponse(error.message, { status: 500 });
  return NextResponse.json({ ok: true });
}
