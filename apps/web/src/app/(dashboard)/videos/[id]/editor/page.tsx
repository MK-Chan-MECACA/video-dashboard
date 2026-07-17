import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import type { Video } from '@vd/shared';
import { supabaseServer, roleOf } from '@/lib/supabase';
import { r2 } from '@/lib/services';
import { CompositionEditor } from '@/components/CompositionEditor';

export const dynamic = 'force-dynamic';

export default async function EditorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user && roleOf(user) !== 'operator') redirect(`/videos/${id}`);

  const { data: video } = await supabase.from('videos').select('*').eq('id', id).single();
  if (!video) notFound();

  const { data: comp } = await supabase
    .from('assets')
    .select('*')
    .eq('video_id', id)
    .eq('kind', 'composition_html')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!comp) {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <Link href={`/videos/${id}`} className="text-sm text-studio-sub hover:text-studio-bright">
          ← Back to video
        </Link>
        <div className="rounded-[12px] border border-studio-border bg-studio-card p-5 text-sm text-studio-sub">
          No editable composition yet — render the video with the HyperFrames engine first.
        </div>
      </div>
    );
  }

  const initialHtml = (await r2().getBytes(comp.r2_key)).toString('utf8');

  // Composition references frozen copies of the media; newer generated assets
  // mean the composition is stale until a fresh template render.
  const { data: newest } = await supabase
    .from('assets')
    .select('created_at')
    .eq('video_id', id)
    .in('kind', ['voiceover', 'avatar_video', 'scene_clip'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  const stale = !!newest && newest.created_at > comp.created_at;

  return <CompositionEditor video={video as Video} initialHtml={initialHtml} stale={stale} />;
}
