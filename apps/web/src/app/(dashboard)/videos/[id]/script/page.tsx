import { notFound, redirect } from 'next/navigation';
import { resolveTargetDurationS, type ScriptVersion, type Video } from '@vd/shared';
import { supabaseServer, roleOf } from '@/lib/supabase';
import { ScriptEditor } from '@/components/ScriptEditor';

export const dynamic = 'force-dynamic';

export default async function ScriptPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user && roleOf(user) !== 'operator') redirect(`/videos/${id}`);

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

  const { data: targetSetting } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', 'target_duration_s')
    .maybeSingle();

  const { data: voiceover } = await supabase
    .from('assets')
    .select('id')
    .eq('video_id', id)
    .eq('kind', 'voiceover')
    .limit(1)
    .maybeSingle();

  return (
    <ScriptEditor
      video={video as Video}
      hasVoiceover={!!voiceover}
      targetDurationS={resolveTargetDurationS(targetSetting?.value)}
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
