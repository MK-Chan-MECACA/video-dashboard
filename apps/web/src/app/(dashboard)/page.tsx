import type { Asset, Job, Video } from '@vd/shared';
import { estimateVideoCost, formatUsd } from '@vd/shared/pricing';
import { supabaseServer } from '@/lib/supabase';
import { BoardClient, type BoardVideo } from '@/components/BoardClient';

export const dynamic = 'force-dynamic';

export default async function BoardPage() {
  const supabase = await supabaseServer();
  const [{ data: videos, error }, { data: assets }, { data: jobs }] = await Promise.all([
    supabase.from('videos').select('*').order('updated_at', { ascending: false }),
    supabase
      .from('assets')
      .select('video_id, kind, scene_index, duration_s')
      .in('kind', ['voiceover', 'avatar_video', 'scene_clip'])
      .order('created_at'),
    supabase
      .from('jobs')
      .select('video_id, type, status, attempts, payload, external_id')
      .in('type', ['avatar', 'scene'])
      .order('created_at'),
  ]);

  if (error) {
    return <p className="text-red-400">Failed to load videos: {error.message}</p>;
  }

  const assetsByVideo = new Map<string, Asset[]>();
  for (const a of (assets ?? []) as Asset[]) {
    (assetsByVideo.get(a.video_id) ?? assetsByVideo.set(a.video_id, []).get(a.video_id)!).push(a);
  }
  const jobsByVideo = new Map<string, Job[]>();
  for (const j of (jobs ?? []) as Job[]) {
    (jobsByVideo.get(j.video_id) ?? jobsByVideo.set(j.video_id, []).get(j.video_id)!).push(j);
  }

  return (
    <BoardClient
      videos={((videos ?? []) as Video[]).map((v): BoardVideo => {
        const cost = estimateVideoCost(assetsByVideo.get(v.id) ?? [], jobsByVideo.get(v.id) ?? []);
        return {
          id: v.id,
          video_no: v.video_no,
          title: v.title,
          status: v.status,
          status_error: v.status_error,
          cost: cost.totalUsd >= 0.05 ? formatUsd(cost.totalUsd, cost.approx) : null,
        };
      })}
    />
  );
}
