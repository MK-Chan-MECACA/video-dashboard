import type { Video } from '@vd/shared';
import { supabaseServer } from '@/lib/supabase';
import { BoardClient, type BoardVideo } from '@/components/BoardClient';

export const dynamic = 'force-dynamic';

export default async function BoardPage() {
  const supabase = await supabaseServer();
  const { data: videos, error } = await supabase
    .from('videos')
    .select('*')
    .order('updated_at', { ascending: false });

  if (error) {
    return <p className="text-red-400">Failed to load videos: {error.message}</p>;
  }

  return (
    <BoardClient
      videos={((videos ?? []) as Video[]).map(
        (v): BoardVideo => ({
          id: v.id,
          video_no: v.video_no,
          title: v.title,
          status: v.status,
          status_error: v.status_error,
        }),
      )}
    />
  );
}
