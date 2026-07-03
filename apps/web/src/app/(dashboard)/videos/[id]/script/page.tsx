import { notFound } from 'next/navigation';
import type { ScriptVersion, Video } from '@vd/shared';
import { supabaseServer } from '@/lib/supabase';
import { ScriptEditor } from '@/components/ScriptEditor';

export const dynamic = 'force-dynamic';

export default async function ScriptPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await supabaseServer();

  const { data: video } = await supabase.from('videos').select('*').eq('id', id).single();
  if (!video) notFound();

  const { data: versions } = await supabase
    .from('script_versions')
    .select('*')
    .eq('video_id', id)
    .order('version', { ascending: false });

  const { data: comments } = await supabase
    .from('review_comments')
    .select('*')
    .eq('video_id', id)
    .eq('resolved', false)
    .order('created_at', { ascending: false });

  return (
    <ScriptEditor
      video={video as Video}
      versions={(versions ?? []) as ScriptVersion[]}
      comments={(comments ?? []).map((c) => ({
        id: c.id,
        section_key: c.section_key,
        author_name: c.author_name,
        body: c.body,
      }))}
    />
  );
}
