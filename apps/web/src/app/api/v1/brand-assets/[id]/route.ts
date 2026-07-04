import { requireApiKey } from '@/lib/apiAuth';
import { handleApi } from '@/lib/apiResponse';
import { deleteBrandAsset } from '@/lib/settingsService';

type Params = { params: Promise<{ id: string }> };

/** DELETE /api/v1/brand-assets/:id */
export function DELETE(req: Request, { params }: Params) {
  return handleApi(async () => {
    const ctx = await requireApiKey(req, 'write');
    const { id } = await params;
    await deleteBrandAsset(ctx.db, id);
    return { ok: true };
  });
}
