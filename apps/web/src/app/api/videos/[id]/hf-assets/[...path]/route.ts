import { NextResponse } from 'next/server';
import { supabaseAdmin, supabaseServer } from '@/lib/supabase';
import { r2 } from '@/lib/services';

type Params = { params: Promise<{ id: string; path: string[] }> };

/**
 * Serves the media referenced by a video's HyperFrames composition. The editor
 * injects <base href=".../hf-assets/"> into the previewed HTML, so relative
 * srcs like "assets/scene_1.mp4" resolve here. The composition asset's
 * meta.assets manifest is the allowlist; redirects to a presigned R2 URL.
 */
export async function GET(_req: Request, { params }: Params) {
  const { id, path } = await params;

  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new NextResponse('Unauthorized', { status: 401 });

  const { data: comp } = await supabaseAdmin()
    .from('assets')
    .select('meta')
    .eq('video_id', id)
    .eq('kind', 'composition_html')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!comp) return new NextResponse('Not found', { status: 404 });

  const manifest = ((comp.meta as Record<string, unknown>)?.assets ?? {}) as Record<string, string>;
  const name = path.at(-1) ?? '';
  const key = manifest[name];
  if (!key) return new NextResponse('Not found', { status: 404 });

  return NextResponse.redirect(await r2().presignGet(key, 3600));
}
