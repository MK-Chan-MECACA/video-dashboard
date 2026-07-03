import { NextResponse } from 'next/server';
import { requireOperator } from '@/lib/supabase';
import { ghl, heygen, wavespeed } from '@/lib/services';

/** GET ?voices=1 | ?ghl=1 | ?scene_models=1 — fetch pickers; plain GET returns saved settings. */
export async function GET(req: Request) {
  let supabase;
  try {
    ({ supabase } = await requireOperator());
  } catch {
    return new NextResponse('Unauthorized', { status: 401 });
  }
  const url = new URL(req.url);

  if (url.searchParams.get('voices')) {
    try {
      const voices = await heygen().listVoices();
      return NextResponse.json(
        voices.filter((v) => v.language?.toLowerCase().includes('english')).slice(0, 200),
      );
    } catch (e) {
      return new NextResponse(String(e), { status: 502 });
    }
  }

  if (url.searchParams.get('scene_models')) {
    try {
      return NextResponse.json(await wavespeed().listSceneModels());
    } catch (e) {
      return new NextResponse(String(e), { status: 502 });
    }
  }

  if (url.searchParams.get('ghl')) {
    try {
      return NextResponse.json(await ghl().listAccounts());
    } catch (e) {
      return new NextResponse(String(e), { status: 502 });
    }
  }

  const { data } = await supabase.from('app_settings').select('key, value');
  return NextResponse.json(Object.fromEntries((data ?? []).map((r) => [r.key, r.value])));
}

/** Upsert settings. Body: { [key]: value } */
export async function PUT(req: Request) {
  let supabase;
  try {
    ({ supabase } = await requireOperator());
  } catch {
    return new NextResponse('Unauthorized', { status: 401 });
  }
  const body = (await req.json()) as Record<string, unknown>;
  for (const [key, value] of Object.entries(body)) {
    const { error } = await supabase
      .from('app_settings')
      .upsert({ key, value, updated_at: new Date().toISOString() });
    if (error) return new NextResponse(error.message, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
