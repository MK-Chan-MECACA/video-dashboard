import { ApiError, requireApiKey } from '@/lib/apiAuth';
import { handleApi } from '@/lib/apiResponse';
import { r2 } from '@/lib/services';

type Params = { params: Promise<{ assetId: string }> };

/** GET /api/v1/assets/:assetId — { url } presigned for 1 hour (re-fetch when it expires). */
export function GET(req: Request, { params }: Params) {
  return handleApi(async () => {
    const ctx = await requireApiKey(req, 'read');
    const { assetId } = await params;
    const { data: asset } = await ctx.db.from('assets').select('*').eq('id', assetId).single();
    if (!asset) throw new ApiError(404, 'Asset not found');
    const url = await r2().presignGet(asset.r2_key, 3600);
    return { url, expires_in: 3600, asset };
  });
}
