import { requireApiKey } from '@/lib/apiAuth';
import { handleApi } from '@/lib/apiResponse';
import { createReviewLink } from '@/lib/videos';

type Params = { params: Promise<{ id: string }> };

/** POST /api/v1/videos/:id/review-links — { kind: 'script' | 'video' } → { url } */
export function POST(req: Request, { params }: Params) {
  return handleApi(async () => {
    const ctx = await requireApiKey(req, 'write');
    const { id } = await params;
    const { kind } = (await req.json()) as { kind: 'script' | 'video' };
    return createReviewLink(ctx.db, id, kind);
  });
}
