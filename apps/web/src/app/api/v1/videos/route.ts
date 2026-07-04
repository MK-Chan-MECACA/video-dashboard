import type { VideoStatus } from '@vd/shared';
import { requireApiKey } from '@/lib/apiAuth';
import { handleApi } from '@/lib/apiResponse';
import { createVideo, listVideos } from '@/lib/videos';

export const maxDuration = 120;

/** GET /api/v1/videos?status=&limit=&offset= */
export function GET(req: Request) {
  return handleApi(async () => {
    const ctx = await requireApiKey(req, 'read');
    const url = new URL(req.url);
    return {
      videos: await listVideos(ctx.db, {
        status: (url.searchParams.get('status') as VideoStatus) || undefined,
        limit: url.searchParams.get('limit') ? Number(url.searchParams.get('limit')) : undefined,
        offset: url.searchParams.get('offset') ? Number(url.searchParams.get('offset')) : undefined,
      }),
    };
  });
}

/** POST /api/v1/videos — { title, topic_brief?, generate? } */
export function POST(req: Request) {
  return handleApi(async () => {
    const ctx = await requireApiKey(req, 'write');
    const body = (await req.json()) as { title: string; topic_brief?: string; generate?: boolean };
    const { video, script } = await createVideo(ctx.db, body);
    return { video, script };
  });
}
