import type { BrandAssetKind } from '@vd/shared';
import { requireApiKey } from '@/lib/apiAuth';
import { handleApi } from '@/lib/apiResponse';
import {
  confirmBrandAsset,
  listBrandAssets,
  presignBrandAssetUpload,
} from '@/lib/settingsService';

/** GET /api/v1/brand-assets — list with presigned download URLs. */
export function GET(req: Request) {
  return handleApi(async () => {
    const ctx = await requireApiKey(req, 'read');
    return { brand_assets: await listBrandAssets(ctx.db, { presign: true }) };
  });
}

/**
 * POST /api/v1/brand-assets — same two-step contract as the operator route:
 * step 1 { kind, filename } → { uploadUrl, key }; step 2 { kind, confirm: true, key, name, is_default? }.
 */
export function POST(req: Request) {
  return handleApi(async () => {
    const ctx = await requireApiKey(req, 'write');
    const body = (await req.json()) as {
      kind: BrandAssetKind;
      filename?: string;
      confirm?: boolean;
      key?: string;
      name?: string;
      is_default?: boolean;
    };
    if (body.confirm) {
      return confirmBrandAsset(ctx.db, {
        kind: body.kind,
        key: body.key ?? '',
        name: body.name ?? '',
        is_default: body.is_default,
      });
    }
    return presignBrandAssetUpload({ kind: body.kind, filename: body.filename ?? 'file.bin' });
  });
}
