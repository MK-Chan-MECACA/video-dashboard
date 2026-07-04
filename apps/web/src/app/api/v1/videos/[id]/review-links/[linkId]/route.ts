import { requireApiKey } from '@/lib/apiAuth';
import { handleApi } from '@/lib/apiResponse';
import { revokeReviewLink } from '@/lib/videos';

type Params = { params: Promise<{ id: string; linkId: string }> };

/** DELETE /api/v1/videos/:id/review-links/:linkId */
export function DELETE(req: Request, { params }: Params) {
  return handleApi(async () => {
    const ctx = await requireApiKey(req, 'write');
    const { id, linkId } = await params;
    await revokeReviewLink(ctx.db, id, linkId);
    return { ok: true };
  });
}
