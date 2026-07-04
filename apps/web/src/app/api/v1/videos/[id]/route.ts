import type { VideoStatus } from '@vd/shared';
import { requireApiKey } from '@/lib/apiAuth';
import { handleApi } from '@/lib/apiResponse';
import { deleteVideo, getVideoDetail, updateVideo } from '@/lib/videos';

type Params = { params: Promise<{ id: string }> };

/** GET /api/v1/videos/:id — full detail: script, jobs, assets (presigned), cost, reviews. */
export function GET(req: Request, { params }: Params) {
  return handleApi(async () => {
    const ctx = await requireApiKey(req, 'read');
    const { id } = await params;
    return getVideoDetail(ctx.db, { id, presignAssets: true });
  });
}

/** PATCH /api/v1/videos/:id — { status?, video_no?, title?, topic_brief?, caption?, schedule_at? } */
export function PATCH(req: Request, { params }: Params) {
  return handleApi(async () => {
    const ctx = await requireApiKey(req, 'write');
    const { id } = await params;
    const body = (await req.json()) as {
      status?: VideoStatus;
      video_no?: number;
      title?: string;
      topic_brief?: string;
      caption?: string;
      schedule_at?: string | null;
    };
    await updateVideo(ctx.db, id, body);
    return { ok: true };
  });
}

/** DELETE /api/v1/videos/:id */
export function DELETE(req: Request, { params }: Params) {
  return handleApi(async () => {
    const ctx = await requireApiKey(req, 'write');
    const { id } = await params;
    return { ok: true, ...(await deleteVideo(ctx.db, id)) };
  });
}
