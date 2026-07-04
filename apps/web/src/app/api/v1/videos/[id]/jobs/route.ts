import { ApiError, requireApiKey } from '@/lib/apiAuth';
import { handleApi } from '@/lib/apiResponse';

type Params = { params: Promise<{ id: string }> };

/** GET /api/v1/videos/:id/jobs — job rows for pipeline polling. */
export function GET(req: Request, { params }: Params) {
  return handleApi(async () => {
    const ctx = await requireApiKey(req, 'read');
    const { id } = await params;
    const { data, error } = await ctx.db
      .from('jobs')
      .select('*')
      .eq('video_id', id)
      .order('created_at');
    if (error) throw new ApiError(500, error.message);
    return { jobs: data ?? [] };
  });
}
