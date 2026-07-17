import { NextResponse } from 'next/server';
import { requireOperator, supabaseAdmin } from '@/lib/supabase';
import { sessionError } from '@/lib/apiResponse';
import { r2 } from '@/lib/services';

type Params = { params: Promise<{ id: string }> };

const MAX_HTML_BYTES = 2 * 1024 * 1024;

/**
 * PUT: save an operator-edited HyperFrames composition. Overwrites the
 * composition's R2 object in place; a fresh template render supersedes edits.
 */
export async function PUT(req: Request, { params }: Params) {
  try {
    await requireOperator();
  } catch {
    return new NextResponse('Unauthorized', { status: 401 });
  }
  const { id } = await params;

  const html = await req.text();
  if (!html.trim()) return new NextResponse('Empty composition', { status: 400 });
  if (Buffer.byteLength(html) > MAX_HTML_BYTES) {
    return new NextResponse('Composition too large', { status: 400 });
  }
  if (!html.includes('data-composition-id')) {
    return new NextResponse('Not a HyperFrames composition (missing data-composition-id)', {
      status: 400,
    });
  }

  try {
    const admin = supabaseAdmin();
    const { data: comp } = await admin
      .from('assets')
      .select('id, r2_key, meta')
      .eq('video_id', id)
      .eq('kind', 'composition_html')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!comp) return new NextResponse('No editable composition', { status: 404 });

    await r2().put(comp.r2_key, html, 'text/html; charset=utf-8');
    await admin
      .from('assets')
      .update({
        meta: { ...(comp.meta as Record<string, unknown>), edited_at: new Date().toISOString() },
        size_bytes: Buffer.byteLength(html),
      })
      .eq('id', comp.id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return sessionError(e);
  }
}
